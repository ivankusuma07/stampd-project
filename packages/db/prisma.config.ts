import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use DIRECT_URL when a pooler sits in front of Postgres, else DATABASE_URL (Railway); the app uses
// DATABASE_URL through the pg adapter in src/index.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stampd",
  },
});
