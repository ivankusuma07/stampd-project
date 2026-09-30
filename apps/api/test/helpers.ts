import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { PublicClient } from "viem";
import type { PrismaClient } from "@stampd/db";
import { startTestDb } from "@stampd/db/testing";
import type { JobMap, JobName } from "@stampd/queue";
import { buildServer, type App } from "../src/server";
import { loadEnv } from "../src/env";
import { MemoryKv } from "../src/lib/kv";
import { createBus } from "../src/lib/bus";
import type { Deps } from "../src/deps";

export const NOW = new Date("2026-09-30T12:00:00Z");
export const FAUCET_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
export const ADMIN = privateKeyToAccount(generatePrivateKey());

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export async function createHarness() {
  const testDb = await startTestDb();
  const jobs: { name: JobName; data: unknown; opts?: unknown }[] = [];
  const chainCalls: string[] = [];
  const kv = new MemoryKv();
  const bus = createBus();
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: testDb.url,
    CHAIN_ID: "31337",
    SESSION_SECRET: "test-secret-test-secret-test-secret-000",
    SIWE_DOMAIN: "stampd.test",
    ADMIN_ADDRESSES: ADMIN.address,
    FAUCET_SIGNER_PRIVATE_KEY: FAUCET_KEY,
  });

  // Only the calls the faucet route makes; everything else fails loudly.
  const chain = {
    readContract: async ({ functionName }: { functionName: string }) => {
      chainCalls.push(functionName);
      if (functionName === "claimNonces") return 3n;
      if (functionName === "nextClaimAt") return 0n;
      throw new Error(`unexpected read ${functionName}`);
    },
    verifySiweMessage: async () => false,
  } as unknown as PublicClient;

  const deps: Deps = {
    env,
    db: testDb.db as unknown as PrismaClient,
    kv,
    chain,
    bus,
    enqueue: async <N extends JobName>(name: N, data: JobMap[N], opts?: unknown) => {
      jobs.push({ name, data, opts });
    },
    verifyCaptcha: async (token) => token === "ok",
    now: () => NOW,
  };
  const app: App = await buildServer(deps);
  await app.ready();

  /** Full SIWE round trip; returns a Cookie header value for the session. */
  // Each sign-in comes from its own IP so the per-IP auth rate limits don't trip across tests.
  let ipCounter = 0;
  async function signIn(account = privateKeyToAccount(generatePrivateKey())) {
    const remoteAddress = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
    const { nonce } = (await app.inject({ method: "GET", url: "/auth/nonce", remoteAddress })).json();
    const message = createSiweMessage({
      address: account.address,
      chainId: 31337,
      domain: "stampd.test",
      nonce,
      uri: "https://stampd.test",
      version: "1",
      issuedAt: NOW,
    });
    const signature = await account.signMessage({ message });
    const res = await app.inject({ method: "POST", url: "/auth/verify", payload: { message, signature }, remoteAddress });
    if (res.statusCode !== 200) throw new Error(`sign in failed: ${res.body}`);
    const cookie = res.cookies.find((c) => c.name === "stampd_session")!;
    return { cookie: `stampd_session=${cookie.value}`, wallet: account.address.toLowerCase(), account };
  }

  return { app, db: testDb.db, deps, jobs, chainCalls, kv, bus, signIn, reset: testDb.reset, stop: testDb.stop };
}

/** Seed one KOL with an open market, trades and price history. */
let seq = 0;
const hex = (n: number, len: number) => `0x${n.toString(16).padStart(len, "0")}`;

export async function seedMarket(db: Harness["db"], overrides: { status?: "OPEN" | "RESOLVED"; handle?: string } = {}) {
  const kol = await db.kol.upsert({
    where: { xHandle: overrides.handle ?? "example_kol" },
    update: {},
    create: { xHandle: overrides.handle ?? "example_kol", name: "Example KOL" },
  });
  const n = ++seq;
  const market = await db.market.create({
    data: {
      onchainId: BigInt(n),
      chainId: 31337,
      kolId: kol.id,
      question: "Will BTC have a Coinbase daily close at or above $90,000 before 31 Mar 2027?",
      rules: "Resolves YES if any Coinbase BTC-USD daily close meets the condition.",
      spec: {},
      questionHash: hex(n, 64),
      category: "crypto",
      sourcePostId: String(1873000000000000000n + BigInt(n)),
      sourcePostUrl: "https://x.com/example_kol/status/1873000000000000000",
      kolSide: "YES",
      closeTime: new Date("2027-03-31T23:59:59Z"),
      resolveBy: new Date("2027-04-01T23:59:59Z"),
      status: overrides.status ?? "OPEN",
      result: overrides.status === "RESOLVED" ? "YES" : null,
      feeBps: 100,
      seedAmount: "200000000",
      openingYesPriceBps: 5000,
      yesPriceBps: 6200,
      yesReserve: "150000000",
      noReserve: "245000000",
      collateral: "250000000",
      volume: "90000000",
      tradeCount: 2,
      openedAt: new Date("2026-09-28T00:00:00Z"),
    },
  });
  await db.pricePoint.createMany({
    data: [
      { marketId: market.id, t: new Date("2026-09-28T00:00:00Z"), yesPriceBps: 5000, source: "trade" },
      { marketId: market.id, t: new Date("2026-09-29T06:00:00Z"), yesPriceBps: 5500, source: "trade" },
      { marketId: market.id, t: new Date("2026-09-30T10:00:00Z"), yesPriceBps: 6200, source: "trade" },
    ],
  });
  await db.trade.createMany({
    data: [
      {
        txHash: hex(n * 2, 64),
        logIndex: 0,
        marketId: market.id,
        wallet: "0x00000000000000000000000000000000000000a1",
        outcome: "YES",
        isBuy: true,
        collateral: "50000000",
        shares: "90000000",
        fee: "500000",
        priceAfterBps: 5500,
        blockNumber: 100n,
        blockTime: new Date("2026-09-29T06:00:00Z"),
      },
      {
        txHash: hex(n * 2 + 1, 64),
        logIndex: 1,
        marketId: market.id,
        wallet: "0x00000000000000000000000000000000000000b2",
        outcome: "YES",
        isBuy: true,
        collateral: "40000000",
        shares: "65000000",
        fee: "400000",
        priceAfterBps: 6200,
        blockNumber: 200n,
        blockTime: new Date("2026-09-30T10:00:00Z"),
      },
    ],
  });
  return { kol, market };
}
