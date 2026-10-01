// Operator commands:
//   pnpm --filter @stampd/worker indexer:backfill   drop indexed rows and re-index from the deploy block
//   pnpm --filter @stampd/worker indexer:reconcile  compare chain and database once
//   pnpm --filter @stampd/worker redraft --since <ISO time>
//       queue AI drafts for stored posts that pass the prefilter but have no prediction yet
//       (e.g. posts stored while drafting was failing). Job ids are deterministic, so nothing doubles.
//   pnpm --filter @stampd/worker reroute
//       re-run routing for drafts waiting in review with their stored AI answers (no new AI calls),
//       publishing the ones that now qualify (after the auto-publish bar or enabled templates change)
import { getDb } from "@stampd/db";
import { prefilter } from "@stampd/ai";
import { enqueue, getQueue, redisConnection, STATUS_KEYS } from "@stampd/queue";
import { TEMPLATES, type TemplateId } from "@stampd/ai";
import { rerouteWaiting } from "./jobs/draft";
import { getDeployment, publicClientFor } from "@stampd/chain";
import { Indexer } from "./indexer/indexer";
import { reconcile } from "./indexer/maintenance";

const command = process.argv[2];
const chainId = Number(process.env.CHAIN_ID ?? 46630);
const db = getDb();
const chain = publicClientFor(chainId, [process.env.RPC_URL, process.env.RPC_URL_BACKUP]);
const deployment = getDeployment(chainId);
const indexer = new Indexer({
  db,
  chain,
  deployment,
  confirmations: Number(process.env.INDEXER_CONFIRMATIONS ?? 2),
  batchBlocks: Number(process.env.INDEXER_BATCH_BLOCKS ?? 2000),
  onEffects: async (effects) => {
    for (const e of effects) if (e.kind === "alert") console.warn(`[alert] ${e.alert}: ${e.message}`);
  },
});

if (command === "backfill") {
  const batches = await indexer.backfill();
  console.log(`re-indexed from block ${deployment.deployBlock} in ${batches} batches`);
} else if (command === "reconcile") {
  const mismatches = await reconcile(db, chain, deployment, async (kind, message) => console.warn(`[${kind}] ${message}`));
  console.log(mismatches.length === 0 ? "chain and database agree" : JSON.stringify(mismatches, null, 2));
} else if (command === "redraft") {
  const since = new Date(process.argv[process.argv.indexOf("--since") + 1] ?? "");
  if (!process.argv.includes("--since") || Number.isNaN(since.getTime())) throw new Error("usage: cli.ts redraft --since <ISO time>");
  const posts = await db.post.findMany({ where: { createdAt: { gte: since }, predictions: { none: {} } } });
  let queued = 0;
  for (const p of posts) {
    if (!prefilter({ text: p.text, replyToId: p.replyToId ?? undefined, isRepost: p.isRepost }).keep) continue;
    await enqueue("ai.draft", { postId: p.id, source: "TIMELINE" }, { jobId: `draft:${p.id}` });
    queued++;
  }
  console.log(`${posts.length} undrafted posts since ${since.toISOString()} · ${queued} passed the prefilter and were queued`);
  await getQueue().close();
} else if (command === "reroute") {
  const redis = redisConnection();
  const enabledTemplates = async () =>
    new Set(((await redis.get(STATUS_KEYS.autoPublishTemplates)) ?? "").split(",").filter((t): t is TemplateId => t in TEMPLATES));
  const r = await rerouteWaiting({ db, enabledTemplates, enqueue });
  console.log(
    `${r.checked} drafts waiting · ${r.published.length} published now` +
      (r.waitingForTemplate ? ` · ${r.waitingForTemplate} qualify but their template is switched off (Admin → templates)` : ""),
  );
  await getQueue().close();
  await redis.quit();
} else {
  console.error("usage: cli.ts backfill | reconcile | redraft --since <ISO time> | reroute");
  process.exitCode = 1;
}
await db.$disconnect();
