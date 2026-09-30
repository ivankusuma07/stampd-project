import { defineConfig } from "@playwright/test";

/**
 * E2E against a running stack: `pnpm dev:local` (API, anvil, indexer) plus the web app
 * (`NEXT_PUBLIC_CHAIN_ID=31337 pnpm --filter @stampd/web dev`). Uses the installed Edge or Chrome
 * so no browser download is needed; set E2E_CHANNEL to switch.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.E2E_CHANNEL ?? "msedge",
    headless: true,
  },
});
