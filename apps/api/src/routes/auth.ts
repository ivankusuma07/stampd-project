import { z } from "zod";
import { generateSiweNonce } from "viem/siwe";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { NONCE_TTL_SEC, clearSession, verifySiwe, writeSession } from "../lib/auth";

/** Sign-In with Ethereum (development plan 3.3). The session is a signed httpOnly cookie. */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;

  app.get("/auth/nonce", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async () => {
    const nonce = generateSiweNonce();
    await deps.kv.set(`siwe:nonce:${nonce}`, "1", NONCE_TTL_SEC);
    return { nonce };
  });

  app.post(
    "/auth/verify",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        body: z.object({
          message: z.string().max(4000),
          signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
        }),
      },
    },
    async (req, reply) => {
      const result = await verifySiwe(deps, req.body.message, req.body.signature as `0x${string}`);
      if (!result.ok) {
        // the reason only (e.g. "wrong domain"), never the message or signature
        req.log.info({ siweError: result.error }, "sign-in rejected");
        return reply.code(401).send({ error: result.error });
      }
      await deps.db.user.upsert({ where: { wallet: result.address }, update: {}, create: { wallet: result.address } });
      writeSession(reply, result.address, deps.now(), deps.env.NODE_ENV === "production");
      return { wallet: result.address, isAdmin: deps.env.ADMIN_ADDRESSES.includes(result.address) };
    },
  );

  app.get("/auth/me", async (req) => {
    if (!req.wallet) return { wallet: null, isAdmin: false, user: null };
    const user = await deps.db.user.findUnique({ where: { wallet: req.wallet } });
    return {
      wallet: req.wallet,
      isAdmin: deps.env.ADMIN_ADDRESSES.includes(req.wallet),
      user: user
        ? {
            displayName: user.displayName,
            points: user.points,
            captchaVerified: user.captchaVerifiedAt !== null,
          }
        : null,
    };
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.patch(
    "/auth/me",
    {
      preHandler: app.requireWallet,
      schema: { body: z.object({ displayName: z.string().trim().min(2).max(24).regex(/^[\w .-]+$/).nullable() }) },
    },
    async (req) => {
      const user = await deps.db.user.update({
        where: { wallet: req.wallet! },
        data: { displayName: req.body.displayName },
      });
      return { displayName: user.displayName };
    },
  );
};
