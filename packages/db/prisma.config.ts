import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use the direct connection (Supabase port 5432); the app uses the pooled
// DATABASE_URL through the pg adapter in src/index.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/stampd",
  },
});
