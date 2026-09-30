import { getDb } from "@stampd/db";
import { publicClientFor } from "@stampd/chain";
import { enqueue } from "@stampd/queue";
import { loadEnv } from "./env";
import { createKv } from "./lib/kv";
import { createBus } from "./lib/bus";
import { verifyTurnstile } from "./lib/captcha";
import { buildServer } from "./server";

const env = loadEnv();
if (env.NODE_ENV === "production" && !env.TURNSTILE_SECRET) {
  throw new Error("TURNSTILE_SECRET is required in production (faucet captcha, plan R12)");
}

const app = await buildServer({
  env,
  db: getDb(),
  kv: createKv(env.REDIS_URL),
  chain: publicClientFor(env.CHAIN_ID, [env.RPC_URL, env.RPC_URL_BACKUP]),
  bus: createBus(env.REDIS_URL),
  enqueue: (name, data, opts) => enqueue(name, data, opts),
  verifyCaptcha: (token, ip) => verifyTurnstile(env.TURNSTILE_SECRET, token, ip),
  now: () => new Date(),
});

await app.listen({ port: env.PORT, host: env.HOST });
