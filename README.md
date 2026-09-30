# STAMPD

KOL call → market → onchain receipt. Crypto calls posted on X become YES/NO prediction markets on Robinhood Chain, traded with demo USD and settled onchain with evidence. Every KOL builds a track record: hit rate and **edge** (how much they beat the crowd), always shown with their sample size.

Plans: [`xkol-analysis-and-web3-plan.md`](xkol-analysis-and-web3-plan.md) (the "plan file") and [`development-plan.md`](development-plan.md). Decisions made while building: [`docs/decisions.md`](docs/decisions.md).

## Layout

```
apps/
  web/        Next.js 16 · React 19 · Tailwind 4 · wagmi/RainbowKit + SIWE — every page in dev plan 1.7
  api/        Fastify 5 + Zod — markets, KOLs, portfolio, faucet vouchers, submissions, notifications (SSE), admin
  worker/     BullMQ — ingest, AI drafting, market creation, indexer, resolver bot, stats, notifications
  scraper/    Python 3.12 · FastAPI · twscrape (pinned) — the only X data source (plan B6b)
packages/
  contracts/  Foundry · OpenZeppelin v5 — DemoUSD, OutcomeTokens, MarketHub (FPMM), MarketFactory, Resolver
  chain/      Robinhood Chain definitions (4663 / 46630), ABIs, deployments, clients
  core/       FPMM quote math (matches Solidity to the unit), edge score, formatting, question hash
  ai/         DeepSeek extraction + check passes, prefilter, validators, moderation routing
  db/         Prisma 7 schema + migration (27 tables), PGlite test database
  queue/      Job names/payloads shared by api and worker
  ui/         "Receipt" design tokens, components, restyled React Bits (MIT + Commons Clause — never publish)
docs/         decisions · runbook · security · moderation playbook
```

## Quick start (no Docker, no Redis)

Needs Node 22+, pnpm 11, [Foundry](https://getfoundry.sh) and, for the scraper, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
pnpm dev:local                                             # PGlite + anvil + contracts + indexer + API, one sample market
NEXT_PUBLIC_CHAIN_ID=31337 pnpm --filter @stampd/web dev   # http://localhost:3000
```

Admin wallet locally = anvil account #0. The runbook covers real deployments: [`docs/runbook.md`](docs/runbook.md).

## Checks

```bash
pnpm verify          # typecheck + all tests + forge test + copy check + React Bits token check
pnpm --filter @stampd/contracts test:fuzz            # 10,000 fuzz runs
cd packages/contracts && uvx --from slither-analyzer slither . --config-file slither.config.json
cd apps/scraper && uv run pytest
pnpm --filter @stampd/web test:e2e                   # Playwright (Edge), against `pnpm dev:local` + the web app
pnpm --filter @stampd/ai live-check                  # real DeepSeek run on 6 known posts (needs DEEPSEEK_API_KEY in .env)
```

What the tests prove:
- **Contracts:** 86 tests including fuzz and invariants: `k` never decreases, solvency, supply = collateral − reserve.
- **Core:** the TypeScript FPMM matches 2,000 Solidity quote vectors to the unit.
- **API:** 26 contract tests against real Postgres (PGlite).
- **Worker:** the indexer against anvil (DB matches chain, backfill rebuilds identical rows, reorg rewind, reconciliation alert), plus an end-to-end create → trade → resolve YES/NO/INVALID → finalize → redeem.
- **Scraper:** kill switch, locked pool, pinned-post ordering.
- **E2E:** every page renders; the trade panel's quote equals `MarketHub.quoteBuy`; reduced motion.

## Status against the development plan

Built and tested locally: Phases 0–6 of the development plan, and the code side of Phase 7 (Slither clean of high/medium, CSP, rate limits, key separation in the deploy script).

Needs you or outside parties before launch:
- **Testnet deploy (1.8):** needs a funded deployer key. The public RPCs are reachable from this machine with WARP on (your ISP's DNS blocks `rpc.*.chain.robinhood.com` otherwise).
- **Accounts and keys:** Postgres and Redis (on Railway), Turnstile, Pinata. Done: DeepSeek key (in the gitignored `.env`), two twscrape accounts (V14).
- **Launch gates:** the external contract review, the multisig (V5), the legal opinion (V11 — the Terms and Privacy pages are marked as drafts), the outage drills on the deployed stack, and the launch KOL list.
