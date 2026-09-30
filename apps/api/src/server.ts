import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  hasZodFastifySchemaValidationErrors,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Deps } from "./deps";
import { readSession } from "./lib/auth";
import { authRoutes } from "./routes/auth";
import { marketRoutes } from "./routes/markets";
import { kolRoutes } from "./routes/kols";
import { meRoutes } from "./routes/me";
import { socialRoutes } from "./routes/social";
import { adminRoutes } from "./routes/admin";

declare module "fastify" {
  interface FastifyInstance {
    deps: Deps;
    requireWallet: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    wallet: string | null;
  }
}

export async function buildServer(deps: Deps) {
  const app = Fastify({
    logger: deps.env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("deps", deps);
  app.decorateRequest("wallet", null);

  await app.register(cookie, { secret: deps.env.SESSION_SECRET });
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.wallet ?? req.ip,
  });
  await app.register(swagger, {
    openapi: { info: { title: "STAMPD API", version: "0.1.0" } },
    transform: jsonSchemaTransform,
  });

  app.addHook("onRequest", async (req) => {
    req.wallet = readSession(req, deps.now());
  });

  app.decorate("requireWallet", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.wallet) await reply.code(401).send({ error: "sign in required" });
  });
  app.decorate("requireAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.wallet) return void (await reply.code(401).send({ error: "sign in required" }));
    if (!deps.env.ADMIN_ADDRESSES.includes(req.wallet)) await reply.code(403).send({ error: "admin only" });
  });

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: "invalid request", issues: err.validation });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "internal error" : (err as Error).message });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await app.register(authRoutes);
  await app.register(marketRoutes);
  await app.register(kolRoutes);
  await app.register(meRoutes);
  await app.register(socialRoutes);
  await app.register(adminRoutes, { prefix: "/admin" });

  return app;
}

export type App = Awaited<ReturnType<typeof buildServer>>;
