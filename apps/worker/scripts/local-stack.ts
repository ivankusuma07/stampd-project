/**
 * `pnpm dev:local` — a full STAMPD backend on this machine with no Docker and no Redis:
 *   Postgres  PGlite (in memory) over the wire protocol on :5433
 *   Chain     a fresh anvil on :8545 with the contracts deployed by script/Deploy.s.sol
 * Everything starts empty each run, so the database and the chain always agree.
 *   API       apps/api on :4000 (in-memory KV/bus instead of Redis)
 *   Indexer   polling every 2s
 * Then run `pnpm --filter @stampd/web dev` with NEXT_PUBLIC_CHAIN_ID=31337.
 *
 * LOCAL DEVELOPMENT ONLY. With --seed it opens one sample market through the real market.create
 * job and places a few trades from anvil's public dev accounts, so the UI has something to show.
 * It refuses to run against any chain other than anvil (31337): seeded activity must never reach
 * a real network (plan A7).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SEED = process.argv.includes("--seed");
const PG_PORT = 5433;
const RPC = "http://127.0.0.1:8545";
const KEYS = {
  admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  creator: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  resolverBot: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  alice: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  bob: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
} as const;

function bin(name: string) {
  const p = join(homedir(), ".foundry", "bin", process.platform === "win32" ? `${name}.exe` : name);
  return existsSync(p) ? p : name;
}

function run(cmd: string, args: string[], env: Record<string, string>, cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

// ------------------------------------------------------------------ postgres

const pg = await PGlite.create();
const migrations = join(ROOT, "packages", "db", "prisma", "migrations");
for (const m of readdirSync(migrations, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  await pg.exec(readFileSync(join(migrations, m, "migration.sql"), "utf8"));
}
const pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: "127.0.0.1" });
await pgServer.start();
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
process.env.DATABASE_URL = DATABASE_URL;
process.env.DATABASE_POOL_MAX = "1"; // PGlite serves one connection at a time
console.log(`postgres  ${DATABASE_URL} (in memory, migrated)`);

// ------------------------------------------------------------------ chain

const chain = createPublicClient({ chain: anvil, transport: http(RPC) });
if ((await chain.getChainId().catch(() => null)) !== null) {
  throw new Error("something is already listening on :8545 — stop it; the local stack starts its own anvil");
}
const anvilProc = spawn(bin("anvil"), ["--port", "8545", "--silent"], { stdio: "ignore" });
for (let i = 0; i < 100 && (await chain.getBlockNumber().catch(() => null)) === null; i++) await new Promise((r) => setTimeout(r, 100));
if ((await chain.getChainId()) !== 31337) throw new Error("refusing to run: not anvil");
{
  console.log("deploying contracts to anvil …");
  await run(
    bin("forge"),
    ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast", "--silent"],
    {
      DEPLOYER_PRIVATE_KEY: KEYS.admin,
      CREATOR_ADDRESS: privateKeyToAccount(KEYS.creator).address,
      RESOLVER_ADDRESS: privateKeyToAccount(KEYS.resolverBot).address,
    },
    join(ROOT, "packages", "contracts"),
  );
  await run("node", ["scripts/export-abis.mjs"], {}, join(ROOT, "packages", "contracts"));
}

// Imported after the deployment file exists so the chain package sees it.
const { getDeployment, demoUSDAbi, marketHubAbi } = await import("@stampd/chain");
const { getDb } = await import("@stampd/db");
const { Indexer } = await import("../src/indexer/indexer");
const deployment = getDeployment(31337);
const db = getDb();
console.log(`chain     ${RPC} (anvil) · MarketHub ${deployment.contracts.MarketHub}`);

// ------------------------------------------------------------------ indexer

const indexer = new Indexer({ db, chain, deployment, confirmations: 0, batchBlocks: 500 });
let indexing = false;
const tick = async () => {
  if (indexing) return;
  indexing = true;
  try {
    await indexer.runUntilHead(50);
  } catch (err) {
    console.error("indexer:", (err as Error).message);
  } finally {
    indexing = false;
  }
};
await tick();
setInterval(tick, 2_000);

// ------------------------------------------------------------------ seed (local sample data)

if (SEED && (await db.market.count()) === 0) {
  const { createMarket } = await import("../src/jobs/market");
  const kol = await db.kol.upsert({ where: { xHandle: "example_kol" }, update: {}, create: { xHandle: "example_kol", name: "Example KOL (local sample)" } });
  const now = Number((await chain.getBlock()).timestamp);
  const close = new Date((now + 30 * 86_400) * 1000);
  const post = await db.post.create({
    data: {
      xPostId: "1",
      kolId: kol.id,
      authorHandle: "example_kol",
      authorId: "1",
      text: "LOCAL SAMPLE — BTC will close above $90k before the deadline.",
      postedAt: new Date(),
      url: "https://x.com/example_kol/status/1",
    },
  });
  const p = await db.prediction.create({
    data: {
      postId: post.id,
      source: "TIMELINE",
      status: "APPROVED",
      seedAmount: "200000000",
      openingPriceBps: 5000,
      feeBps: 100,
      spec: {
        version: 1,
        question: "LOCAL SAMPLE: Will BTC have a Coinbase daily close at or above $90,000 before the deadline?",
        rules: "Local development sample. Resolves YES if any Coinbase BTC-USD daily close (UTC) from open to the deadline is >= 90000.",
        category: "crypto",
        kolHandle: "example_kol",
        kolSide: "YES",
        sourcePostUrl: post.url,
        sourcePostId: "1",
        closeTime: close.toISOString(),
        resolveBy: new Date(close.getTime() + 86_400_000).toISOString(),
        resolution: { source: "coinbase-daily-close", url: "", subject: "BTC", metric: "daily close", comparator: ">=", threshold: "90000", mode: "any-close-before" },
      },
    },
  });
  console.log("seed      creating the sample market …");
  const wallet = (k: Hex) => createWalletClient({ chain: anvil, transport: http(RPC), account: privateKeyToAccount(k) });
  await createMarket({ db, chain, wallet: wallet(KEYS.creator), deployment, alert: async (k, m) => console.warn(k, m) }, p.id);
  console.log("seed      market tx sent, indexing …");
  await tick();
  const market = await db.market.findFirstOrThrow({ where: { predictionId: p.id } });
  const admin = wallet(KEYS.admin);
  for (const [key, outcome, usd] of [
    [KEYS.alice, 1, 40n],
    [KEYS.bob, 0, 15n],
    [KEYS.alice, 1, 25n],
  ] as const) {
    const w = wallet(key);
    await chain.waitForTransactionReceipt({ hash: await admin.writeContract({ address: deployment.contracts.DemoUSD, abi: demoUSDAbi, functionName: "mint", args: [w.account.address, usd * 1_000_000n] }) });
    await chain.waitForTransactionReceipt({ hash: await w.writeContract({ address: deployment.contracts.DemoUSD, abi: demoUSDAbi, functionName: "approve", args: [deployment.contracts.MarketHub, 2n ** 255n] }) });
    await chain.waitForTransactionReceipt({
      hash: await w.writeContract({ address: deployment.contracts.MarketHub, abi: marketHubAbi, functionName: "buy", args: [market.onchainId!, outcome, usd * 1_000_000n, 0n, 2n ** 63n] }),
    });
  }
  await tick();
  console.log(`seeded    1 local sample market (${market.id}) with 3 trades`);
}

// ------------------------------------------------------------------ stats (the worker's stats.kol / stats.edge jobs)

const { computeEdgeInputs, computeKolStats } = await import("../src/jobs/stats");
const stats = async () => {
  try {
    await computeEdgeInputs(db);
    await computeKolStats(db);
  } catch (err) {
    console.error("stats:", (err as Error).message);
  }
};
await stats();
setInterval(stats, 60_000);

// ------------------------------------------------------------------ api

const { buildServer, loadEnv, MemoryKv, createBus } = await import("@stampd/api/local");
const env = loadEnv({
  NODE_ENV: "development",
  DATABASE_URL,
  CHAIN_ID: "31337",
  RPC_URL: RPC,
  SESSION_SECRET: process.env.SESSION_SECRET ?? "local-dev-secret-local-dev-secret-0000",
  SIWE_DOMAIN: process.env.SIWE_DOMAIN ?? "localhost:3000",
  ADMIN_ADDRESSES: process.env.ADMIN_ADDRESSES ?? privateKeyToAccount(KEYS.admin).address,
  FAUCET_SIGNER_PRIVATE_KEY: KEYS.admin,
});
const app = await buildServer({
  env,
  db,
  kv: new MemoryKv(),
  chain,
  bus: createBus(),
  enqueue: async (name, data) => console.log(`[queue:${name}] ${JSON.stringify(data)} (no worker in local mode)`),
  verifyCaptcha: async () => true,
  now: () => new Date(),
});
await app.listen({ port: 4000, host: "127.0.0.1" });
console.log("api       http://127.0.0.1:4000  (admin wallet = anvil account #0)");
console.log("web       NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 pnpm --filter @stampd/web dev");

const stop = async () => {
  await app.close();
  await pgServer.stop();
  await pg.close();
  anvilProc.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
