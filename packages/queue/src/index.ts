import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";

/**
 * Job names and payloads shared by apps/api (producer) and apps/worker (consumer).
 * Every job is idempotent by a natural key (development plan §2 conventions): the jobId is
 * derived from that key, so enqueueing twice does nothing.
 */
export const QUEUE = "stampd";

export type JobMap = {
  /** schedule per-KOL timeline fetches that are due */
  "ingest.schedule": Record<string, never>;
  "ingest.timeline": { kolId: string };
  "ingest.post": { submissionId: string };
  "ingest.reconcile": Record<string, never>;
  "ingest.canary": Record<string, never>;
  "ingest.health": Record<string, never>;
  "ai.draft": { postId: string; source: "TIMELINE" | "WEB"; submissionId?: string };
  "market.create": { predictionId: string };
  "indexer.tick": Record<string, never>;
  "indexer.snapshot": Record<string, never>;
  "indexer.reconcile": Record<string, never>;
  "resolver.scan": Record<string, never>;
  /** manual proposal requested by an admin (e.g. INVALID for a broken market) */
  "resolver.propose": { marketId: string; outcome: "YES" | "NO" | "INVALID"; note: string };
  "stats.kol": { kolId?: string };
  "stats.edge": Record<string, never>;
  "notify.fanout": NotifyEvent;
};
export type JobName = keyof JobMap;

export type NotifyEvent =
  | { kind: "market.opened"; marketId: string }
  | { kind: "market.resolved"; marketId: string }
  | { kind: "submission.updated"; submissionId: string };

/** Pub/sub channel carrying new notifications to the API's SSE streams. */
export const notificationChannel = (wallet: string) => `notify:${wallet.toLowerCase()}`;

let connection: Redis | undefined;

/** BullMQ needs `maxRetriesPerRequest: null` on its connection. */
export function redisConnection(url = process.env.REDIS_URL): Redis {
  if (!url) throw new Error("REDIS_URL is not set");
  connection ??= new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return connection;
}

let queue: Queue | undefined;
export function getQueue(): Queue {
  queue ??= new Queue(QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 5_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return queue;
}

export function enqueue<N extends JobName>(name: N, data: JobMap[N], opts: JobsOptions = {}) {
  return getQueue().add(name, data, opts);
}

/** Status flags the worker writes to Redis and the API reads (e.g. the "new markets paused" banner). */
export const STATUS_KEYS = {
  ingestPaused: "status:ingest:paused",
  ingestPausedReason: "status:ingest:pausedReason",
  ingestLastSuccess: "status:ingest:lastSuccessAt",
  indexerBlock: "status:indexer:block",
  /** JSON from the scraper's /health, refreshed by the worker */
  scraperHealth: "status:scraper:health",
  /** comma-separated auto-publish template ids switched on by an admin */
  autoPublishTemplates: "config:autoPublishTemplates",
} as const;
