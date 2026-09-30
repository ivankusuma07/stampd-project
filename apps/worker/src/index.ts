import { Worker, type Job } from "bullmq";
import { getDb } from "@stampd/db";
import { getDeployment, publicClientFor, walletClientFor } from "@stampd/chain";
import { ClaimAi, TEMPLATES, type TemplateId } from "@stampd/ai";
import { QUEUE, STATUS_KEYS, enqueue, getQueue, notificationChannel, redisConnection, type JobMap, type JobName } from "@stampd/queue";
import { loadEnv } from "./env";
import { createAlerter } from "./lib/alerts";
import { ScraperClient } from "./lib/scraper";
import { Indexer } from "./indexer/indexer";
import { reconcile, snapshotPrices } from "./indexer/maintenance";
import type { Effect } from "./indexer/project";
import { ResolverBot } from "./resolver/bot";
import { createMarket } from "./jobs/market";
import { draftPost } from "./jobs/draft";
import { canary, checkHealth, fetchSubmittedPost, fetchTimeline, reconcileIngest, scheduleTimelines, type IngestDeps } from "./jobs/ingest";
import { computeEdgeInputs, computeKolStats } from "./jobs/stats";
import { fanout } from "./jobs/notify";

const env = loadEnv();
const db = getDb();
const redis = redisConnection(env.REDIS_URL);
const publisher = redis.duplicate();
const deployment = getDeployment(env.CHAIN_ID);
const chain = publicClientFor(env.CHAIN_ID, [env.RPC_URL, env.RPC_URL_BACKUP]);
const alert = createAlerter(db, { resendKey: env.RESEND_API_KEY, to: env.ALERT_EMAIL_TO, from: env.ALERT_EMAIL_FROM });
const status = { get: (k: string) => redis.get(k), set: (k: string, v: string) => redis.set(k, v) };

async function handleEffects(effects: Effect[]) {
  for (const e of effects) {
    if (e.kind === "notify") await enqueue("notify.fanout", { kind: e.event, marketId: e.marketId }, { jobId: `notify:${e.event}:${e.marketId}` });
    if (e.kind === "stats") await enqueue("stats.kol", { kolId: e.kolId });
    if (e.kind === "alert") await alert(e.alert, e.message, e.data);
  }
}

const indexer = new Indexer({
  db,
  chain,
  deployment,
  confirmations: env.INDEXER_CONFIRMATIONS,
  batchBlocks: env.INDEXER_BATCH_BLOCKS,
  onEffects: handleEffects,
  onBlock: async (block) => void (await redis.set(STATUS_KEYS.indexerBlock, block.toString())),
});

const creatorWallet = env.CREATOR_PRIVATE_KEY ? walletClientFor(env.CHAIN_ID, env.CREATOR_PRIVATE_KEY as `0x${string}`, [env.RPC_URL, env.RPC_URL_BACKUP]) : null;
const resolverWallet = env.RESOLVER_PRIVATE_KEY ? walletClientFor(env.CHAIN_ID, env.RESOLVER_PRIVATE_KEY as `0x${string}`, [env.RPC_URL, env.RPC_URL_BACKUP]) : null;
const resolverBot = resolverWallet
  ? new ResolverBot({ db, chain, wallet: resolverWallet, deployment, alert, ipfsToken: env.IPFS_PIN_TOKEN })
  : null;

const ingest: IngestDeps = {
  db,
  scraper: new ScraperClient(env.SCRAPER_URL, env.SCRAPER_TOKEN),
  status,
  alert,
  enqueue: (name, data, opts) => enqueue(name, data, opts),
  enabled: env.SCRAPER_ENABLED,
  minActiveAccounts: env.SCRAPER_MIN_ACTIVE_ACCOUNTS,
  canaryHandle: env.CANARY_HANDLE,
};

const enabledTemplates = async () =>
  new Set(
    ((await redis.get(STATUS_KEYS.autoPublishTemplates)) ?? "")
      .split(",")
      .filter((t): t is TemplateId => t in TEMPLATES),
  );

/** Single-flight guard for jobs that must never overlap (the indexer, the resolver). */
async function exclusive<T>(name: string, ttlSec: number, fn: () => Promise<T>): Promise<T | null> {
  const ok = await redis.set(`lock:${name}`, String(process.pid), "EX", ttlSec, "NX");
  if (!ok) return null;
  try {
    return await fn();
  } finally {
    await redis.del(`lock:${name}`);
  }
}

type Handlers = { [N in JobName]: (data: JobMap[N]) => Promise<unknown> };

const handlers: Handlers = {
  "ingest.schedule": () => scheduleTimelines(ingest),
  "ingest.timeline": (data) => fetchTimeline(ingest, data),
  "ingest.post": (data) => fetchSubmittedPost(ingest, data),
  "ingest.reconcile": () => reconcileIngest(ingest),
  "ingest.canary": () => canary(ingest),
  "ingest.health": () => checkHealth(ingest),
  "ai.draft": (data) => {
    if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not set");
    return draftPost(
      {
        db,
        ai: (onCall) => new ClaimAi({ apiKey: env.DEEPSEEK_API_KEY, model: env.AI_MODEL, thinking: env.AI_THINKING, onCall }),
        enabledTemplates,
        enqueue: (name, d, opts) => enqueue(name, d, opts),
      },
      data,
    );
  },
  "market.create": (data) => {
    if (!creatorWallet) throw new Error("CREATOR_PRIVATE_KEY is not set");
    return createMarket({ db, chain, wallet: creatorWallet, deployment, alert, ipfsToken: env.IPFS_PIN_TOKEN }, data.predictionId);
  },
  "indexer.tick": () => exclusive("indexer", 300, () => indexer.runUntilHead(20)),
  "indexer.snapshot": () => snapshotPrices(db, new Date()),
  "indexer.reconcile": () => reconcile(db, chain, deployment, alert),
  "resolver.scan": () => {
    if (!resolverBot) return Promise.resolve({ skipped: "RESOLVER_PRIVATE_KEY is not set" });
    return exclusive("resolver", 600, () => resolverBot.scan());
  },
  "resolver.propose": (data) => {
    if (!resolverBot) throw new Error("RESOLVER_PRIVATE_KEY is not set");
    return exclusive("resolver", 600, () => resolverBot.manualPropose(data.marketId, data.outcome, data.note));
  },
  "stats.kol": (data) => computeKolStats(db, data.kolId),
  "stats.edge": async () => {
    const n = await computeEdgeInputs(db);
    if (n > 0) await computeKolStats(db);
    return n;
  },
  "notify.fanout": (data) => fanout(db, (wallet, payload) => publisher.publish(notificationChannel(wallet), payload), data),
};

const worker = new Worker(
  QUEUE,
  async (job: Job) => {
    const handler = handlers[job.name as JobName] as ((d: unknown) => Promise<unknown>) | undefined;
    if (!handler) throw new Error(`unknown job ${job.name}`);
    return handler(job.data);
  },
  { connection: redisConnection(env.REDIS_URL), concurrency: 4 },
);
worker.on("failed", (job, err) => console.error(`[job] ${job?.name} ${job?.id} failed: ${err.message}`));

// Repeating schedules (development plan §2 "BullMQ workers").
const queue = getQueue();
const every = async (name: JobName, ms: number) =>
  queue.upsertJobScheduler(`every:${name}`, { every: ms }, { name, data: {} });
await every("indexer.tick", 4_000);
await every("indexer.snapshot", 5 * 60_000);
await every("indexer.reconcile", 60 * 60_000);
await every("ingest.schedule", 60_000);
await every("ingest.health", 60_000);
await every("ingest.canary", 24 * 3600_000);
await every("ingest.reconcile", 24 * 3600_000);
await every("resolver.scan", 5 * 60_000);
await every("stats.edge", 10 * 60_000);
await every("stats.kol", 60 * 60_000);

console.log(`worker up · chain ${env.CHAIN_ID} · scraping ${env.SCRAPER_ENABLED ? "on" : "OFF (kill switch)"}`);

async function shutdown() {
  await worker.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
