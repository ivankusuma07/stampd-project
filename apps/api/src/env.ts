import { z } from "zod";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex private key");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  /** "::" listens on IPv6 and IPv4 (Railway's private network is IPv6) */
  HOST: z.string().default("::"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  CHAIN_ID: z.coerce.number().default(46630),
  RPC_URL: z.string().optional(),
  RPC_URL_BACKUP: z.string().optional(),
  FAUCET_SIGNER_PRIVATE_KEY: hex32.optional(),
  /** whole dUSD per faucet claim */
  FAUCET_CLAIM_USD: z.coerce.number().int().positive().default(100),
  FAUCET_CLAIMS_PER_IP_PER_DAY: z.coerce.number().int().positive().default(3),
  TURNSTILE_SECRET: z.string().optional(),
  SIWE_DOMAIN: z.string().default("localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ADMIN_ADDRESSES: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    ),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  SUBMISSIONS_PER_DAY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
