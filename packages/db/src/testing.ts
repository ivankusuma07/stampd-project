import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

/**
 * In-process Postgres for tests: PGlite (Postgres compiled to WASM) served over the wire
 * protocol, with every migration applied. No Docker needed. One connection at a time, so the
 * Prisma pool is capped at 1.
 */
export async function startTestDb() {
  const pg = await PGlite.create();
  const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");
  for (const dir of readdirSync(migrations, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    await pg.exec(readFileSync(join(migrations, dir, "migration.sql"), "utf8"));
  }
  const server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await server.start();
  const address = server.getServerConn();
  const url = `postgresql://postgres:postgres@${address}/postgres?sslmode=disable`;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });

  /** Empty every table (keeps the schema). */
  async function reset() {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }

  async function stop() {
    await db.$disconnect();
    await server.stop();
    await pg.close();
  }

  return { url, db, reset, stop };
}
