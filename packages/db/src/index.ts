import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";
export { Prisma } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __stampdPrisma?: PrismaClient };

/** One client per process (hot reload safe). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__stampdPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    // DATABASE_POOL_MAX: tune for the Supabase pooler; 1 for the single-connection local PGlite.
    const max = process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : undefined;
    globalForPrisma.__stampdPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
  }
  return globalForPrisma.__stampdPrisma;
}

/** Lowercase an address before it touches the database. */
export function wallet(address: string): string {
  return address.toLowerCase();
}
