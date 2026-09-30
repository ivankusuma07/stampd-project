import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { privateKeyToAccount } from "viem/accounts";
import { demoUSDAbi, getDeployment, hasDeployment } from "@stampd/chain";
import { parsePostUrl } from "@stampd/core";
import type { Prisma } from "@stampd/db";
import { amount, marketDto } from "../lib/dto";

const USD = 1_000_000n;
const VOUCHER_TTL_SEC = 15 * 60;

const big = (d: Prisma.Decimal) => BigInt(d.toFixed(0));

/** Routes for the signed-in wallet: portfolio, faucet, submissions, notifications. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;
  const { db, env } = deps;

  // ------------------------------------------------------------------ portfolio

  app.get("/portfolio", { preHandler: app.requireWallet }, async (req) => {
    const now = deps.now();
    const positions = await db.position.findMany({
      where: { wallet: req.wallet! },
      include: { market: { include: { kol: true, resolution: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      positions: positions
        .filter((p) => p.yesShares.gt(0) || p.noShares.gt(0) || p.redeemedAt)
        .map((p) => {
          const m = p.market;
          const yes = big(p.yesShares);
          const no = big(p.noShares);
          const value = (yes * BigInt(m.yesPriceBps) + no * BigInt(10_000 - m.yesPriceBps)) / 10_000n;
          let redeemable = 0n;
          if (m.status === "RESOLVED" && !p.redeemedAt) {
            redeemable = m.result === "YES" ? yes : m.result === "NO" ? no : (yes + no) / 2n;
          }
          return {
            market: marketDto(m, now, { resolution: m.resolution }),
            yesShares: yes.toString(),
            noShares: no.toString(),
            costBasis: amount(p.costBasis),
            realizedPnl: amount(p.realizedPnl),
            value: value.toString(),
            redeemable: redeemable.toString(),
            redeemedAt: p.redeemedAt?.toISOString() ?? null,
            payout: amount(p.payout),
          };
        }),
    };
  });

  // ------------------------------------------------------------------ faucet

  /**
   * Captcha → voucher (development plan 3.4). The contract enforces one claim per address per
   * 24h and binds the voucher to the address and its nonce; this route adds the captcha and a
   * per-IP limit (plan R12) and marks the wallet captcha-verified for edge eligibility.
   */
  app.post(
    "/faucet/voucher",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { body: z.object({ captchaToken: z.string().min(1).max(4096) }) },
    },
    async (req, reply) => {
      if (!env.FAUCET_SIGNER_PRIVATE_KEY || !hasDeployment(env.CHAIN_ID)) {
        return reply.code(503).send({ error: "faucet not configured" });
      }
      if (!(await deps.verifyCaptcha(req.body.captchaToken, req.ip))) {
        return reply.code(400).send({ error: "captcha failed" });
      }
      const now = deps.now();
      const wallet = req.wallet!;
      const ipHash = createHash("sha256").update(`${req.ip}:${env.SESSION_SECRET}`).digest("hex");
      const since = new Date(now.getTime() - 24 * 3600 * 1000);
      const ipClaims = await db.faucetClaim.count({ where: { ipHash, createdAt: { gte: since } } });
      if (ipClaims >= env.FAUCET_CLAIMS_PER_IP_PER_DAY) {
        return reply.code(429).send({ error: "too many claims from this network today" });
      }

      const usd = getDeployment(env.CHAIN_ID).contracts.DemoUSD;
      const [nonce, nextClaimAt] = await Promise.all([
        deps.chain.readContract({ address: usd, abi: demoUSDAbi, functionName: "claimNonces", args: [wallet as `0x${string}`] }),
        deps.chain.readContract({ address: usd, abi: demoUSDAbi, functionName: "nextClaimAt", args: [wallet as `0x${string}`] }),
      ]);
      if (nextClaimAt > BigInt(Math.floor(now.getTime() / 1000))) {
        return reply.code(429).send({ error: "already claimed", availableAt: new Date(Number(nextClaimAt) * 1000).toISOString() });
      }

      const amountRaw = BigInt(env.FAUCET_CLAIM_USD) * USD;
      const deadline = BigInt(Math.floor(now.getTime() / 1000) + VOUCHER_TTL_SEC);
      const signature = await privateKeyToAccount(env.FAUCET_SIGNER_PRIVATE_KEY as `0x${string}`).signTypedData({
        domain: { name: "STAMPD Demo USD", version: "1", chainId: env.CHAIN_ID, verifyingContract: usd },
        types: {
          Claim: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Claim",
        message: { to: wallet as `0x${string}`, amount: amountRaw, nonce, deadline },
      });

      await db.$transaction([
        db.faucetClaim.create({
          data: { wallet, ipHash, amount: amountRaw.toString(), nonce: Number(nonce), deadline: new Date(Number(deadline) * 1000) },
        }),
        db.user.update({ where: { wallet }, data: { captchaVerifiedAt: now } }),
      ]);
      return { amount: amountRaw.toString(), deadline: deadline.toString(), signature };
    },
  );

  // ------------------------------------------------------------------ submissions

  /** Paste-a-link submission (plan B2 feature 1, development plan 4.7). */
  app.post(
    "/submissions",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { body: z.object({ url: z.string().trim().max(300) }) },
    },
    async (req, reply) => {
      const parsed = parsePostUrl(req.body.url);
      if (!parsed) return reply.code(400).send({ error: "paste a link to a post on x.com or twitter.com" });
      const wallet = req.wallet!;
      const now = deps.now();

      const existingMarket = await db.market.findFirst({
        where: { sourcePostId: parsed.id, status: { not: "PENDING" } },
        select: { id: true },
      });
      if (existingMarket) return reply.code(409).send({ error: "already a market", marketId: existingMarket.id });

      const mine = await db.submission.findUnique({ where: { wallet_xPostId: { wallet, xPostId: parsed.id } } });
      if (mine) return reply.code(409).send({ error: "you already submitted this post", submission: submissionDto(mine) });

      const today = await db.submission.count({
        where: { wallet, createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
      });
      if (today >= env.SUBMISSIONS_PER_DAY) {
        return reply.code(429).send({ error: `limit is ${env.SUBMISSIONS_PER_DAY} submissions per day` });
      }

      const submission = await db.submission.create({
        data: { wallet, xPostUrl: `https://x.com/${parsed.handle}/status/${parsed.id}`, xPostId: parsed.id },
      });
      await deps.enqueue("ingest.post", { submissionId: submission.id }, { jobId: `submission:${submission.id}` });
      return reply.code(201).send({ submission: submissionDto(submission) });
    },
  );

  app.get("/submissions", { preHandler: app.requireWallet }, async (req) => {
    const rows = await db.submission.findMany({
      where: { wallet: req.wallet! },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { prediction: { include: { market: { select: { id: true, question: true, status: true } } } } },
    });
    return {
      submissions: rows.map((s) => ({
        ...submissionDto(s),
        market: s.prediction?.market && s.prediction.market.status !== "PENDING" ? s.prediction.market : null,
        question: (s.prediction?.extracted as { question?: string } | null)?.question ?? null,
      })),
    };
  });

  // ------------------------------------------------------------------ notifications

  app.get(
    "/notifications",
    {
      preHandler: app.requireWallet,
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).default(30),
          before: z.coerce.date().optional(),
        }),
      },
    },
    async (req) => {
      const wallet = req.wallet!;
      const [items, unread] = await Promise.all([
        db.notification.findMany({
          where: { userWallet: wallet, ...(req.query.before ? { createdAt: { lt: req.query.before } } : {}) },
          orderBy: { createdAt: "desc" },
          take: req.query.limit,
        }),
        db.notification.count({ where: { userWallet: wallet, readAt: null } }),
      ]);
      return {
        unread,
        notifications: items.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          href: n.href,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post(
    "/notifications/read",
    {
      preHandler: app.requireWallet,
      schema: { body: z.object({ ids: z.array(z.string().max(40)).max(100).optional(), all: z.boolean().optional() }) },
    },
    async (req) => {
      const where: Prisma.NotificationWhereInput = { userWallet: req.wallet!, readAt: null };
      if (!req.body.all) where.id = { in: req.body.ids ?? [] };
      const { count } = await db.notification.updateMany({ where, data: { readAt: deps.now() } });
      return { marked: count };
    },
  );

  /**
   * Live notifications over Server-Sent Events (development plan 6.3). Each event only says
   * "something new"; the client refetches /notifications. Clients also poll every 30s.
   */
  app.get("/notifications/stream", { preHandler: app.requireWallet }, (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 5000\n\n");
    const unsubscribe = deps.bus.subscribe(req.wallet!, (payload) => {
      reply.raw.write(`event: notification\ndata: ${payload}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
};

function submissionDto(s: {
  id: string;
  xPostUrl: string;
  xPostId: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    xPostUrl: s.xPostUrl,
    xPostId: s.xPostId,
    status: s.status,
    reason: s.reason,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
