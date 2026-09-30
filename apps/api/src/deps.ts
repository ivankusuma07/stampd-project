import type { PrismaClient } from "@stampd/db";
import type { PublicClient } from "viem";
import type { JobMap, JobName } from "@stampd/queue";
import type { Env } from "./env";
import type { Kv } from "./lib/kv";
import type { NotificationBus } from "./lib/bus";

/** Everything a route needs, injected so tests can swap in fakes. */
export type Deps = {
  env: Env;
  db: PrismaClient;
  kv: Kv;
  chain: PublicClient;
  bus: NotificationBus;
  enqueue: <N extends JobName>(name: N, data: JobMap[N], opts?: { jobId?: string; delay?: number }) => Promise<unknown>;
  /** Cloudflare Turnstile check; resolves true when the token is valid for this IP. */
  verifyCaptcha: (token: string, ip: string) => Promise<boolean>;
  now: () => Date;
};
