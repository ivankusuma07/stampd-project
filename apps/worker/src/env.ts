import { z } from "zod";

const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex private key");
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CHAIN_ID: z.coerce.number().default(46630),
  RPC_URL: z.string().optional(),
  RPC_URL_BACKUP: z.string().optional(),
  CREATOR_PRIVATE_KEY: key.optional(),
  RESOLVER_PRIVATE_KEY: key.optional(),
  /** blocks behind head before an event is indexed */
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).default(2),
  INDEXER_BATCH_BLOCKS: z.coerce.number().int().min(1).default(2_000),

  SCRAPER_URL: z.string().default("http://localhost:8000"),
  SCRAPER_TOKEN: z.string().optional(),
  /** kill switch (plan B6b): false stops every scraper call immediately */
  SCRAPER_ENABLED: bool.default(true),
  SCRAPER_MIN_ACTIVE_ACCOUNTS: z.coerce.number().int().min(0).default(2),
  CANARY_HANDLE: z.string().default("coinbase"),

  DEEPSEEK_API_KEY: z.string().optional(),
  /** deepseek-flash (default) or deepseek-v4-pro */
  AI_MODEL: z.string().optional(),
  AI_THINKING: z.enum(["enabled", "disabled"]).default("disabled"),

  IPFS_PIN_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().default("STAMPD alerts <alerts@stampd.local>"),
  WEB_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }
  return parsed.data;
}
