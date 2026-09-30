# Runbook

## Services

| Service | Where | Notes |
|---|---|---|
| `apps/web` | Vercel | Proxies `/api/*` to the API. Set `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. |
| `apps/api` | Fly.io / Railway | Stateless; needs Postgres + Redis. |
| `apps/worker` | Fly.io / Railway | BullMQ worker plus all repeating schedules. Run **one** instance per chain (the indexer and resolver also take Redis locks). |
| `apps/scraper` | Fly.io, **exactly one machine** | twscrape sessions in SQLite on the `scraper_data` volume. |
| Postgres | Supabase | `DATABASE_URL` pooled, `DIRECT_URL` for migrations. |
| Redis | Upstash | Queue, SIWE nonces, status flags, notification pub/sub. |

## Deploy the contracts (development plan 1.8 / 7.5)

```bash
cd packages/contracts
export DEPLOYER_PRIVATE_KEY=0x…            # deploy only; never on a server
export ADMIN_ADDRESS=0x… CREATOR_ADDRESS=0x… RESOLVER_ADDRESS=0x… ARBITER_ADDRESS=0x… FAUCET_SIGNER_ADDRESS=0x…
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
pnpm abis                                   # writes packages/chain ABIs + deployments
CREATOR_PRIVATE_KEY=0x… forge script script/Smoke.s.sol --rpc-url $RPC_URL --broadcast   # one real buy
```

Mainnet: chain 4663, verifier URL `https://robinhoodchain.blockscout.com/api/`. Commit `deployments/<chainId>.json` and the regenerated `packages/chain/src/deployments.generated.ts`, then redeploy web/api/worker.

## Roles (development plan 7.2)

| Role | Contract | Holder | Used by |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | all | multisig (`ADMIN_ADDRESS`) | role changes, limits |
| `PAUSER_ROLE` | DemoUSD, MarketHub | multisig | emergency pause; per-market pause from /admin |
| `CREATOR_ROLE` | MarketFactory | creator key | worker `market.create` |
| `RESOLVER_ROLE` | Resolver | resolver key | worker `resolver.scan` / `resolver.propose` |
| `ARBITER_ROLE` | Resolver | multisig | /admin → Resolutions → Arbitrate |
| `FAUCET_SIGNER_ROLE` | DemoUSD | faucet signer key | API `/faucet/voucher` |
| `MINTER_ROLE` | DemoUSD | treasury (admin) | seed liquidity top-ups |
| `MINTER_ROLE` | OutcomeTokens | MarketHub contract | — |
| `FACTORY_ROLE` / `RESOLVER_ROLE` | MarketHub | factory / resolver contracts | — |

Check each onchain with `cast call <contract> "hasRole(bytes32,address)(bool)" <role> <address>` and record the result here before mainnet.

The creator key needs dUSD for seed liquidity (the deploy mints 100,000) and the resolver key needs dUSD for bonds (5,000); top them up with the treasury's `MINTER_ROLE`.

## Database

```bash
pnpm --filter @stampd/db migrate:deploy     # uses DIRECT_URL
pnpm --filter @stampd/db seed               # tracked-KOL list (edit prisma/seed.ts; plan B11 #5)
```

## Indexer

- Backfill / rebuild from the deploy block: `pnpm --filter @stampd/worker indexer:backfill`
- One-off chain vs database comparison: `pnpm --filter @stampd/worker indexer:reconcile`
- Reorgs are handled automatically (alert `indexer.reorg`). `indexer.reserve-drift` or `indexer.reconcile` alerts mean the read model disagrees with the chain: run a backfill and investigate.

## Scraper (plan B6b)

- Accounts: add dedicated accounts only, never a personal or brand account: `uv run twscrape add_accounts …` then `uv run twscrape login_accounts` inside the scraper machine, with `ACCOUNTS_DB=/data/accounts.db`.
- **Kill switch:** set `SCRAPER_ENABLED=false` on the worker (stops every call at once) and on the scraper (503 on all data routes). New markets stop; everything else keeps working.
- Upgrades: twscrape is pinned in `apps/scraper/pyproject.toml`. When X changes its internals, bump it deliberately, run `uv run pytest` and the canary, then deploy.

## Auto-publish (plan B10a)

All templates start off. /admin → Templates shows AI–human agreement per template. The button only enables at ≥ 95% agreement over ≥ 100 reviewed cases. Turn on one template at a time.

## Outage drills (development plan 7.3)

Record date, result and time-to-alert for each.

| Drill | Expected | Last run |
|---|---|---|
| Stop `apps/scraper` | within ~1 min: `ingest.paused` alert, "New markets paused" banner, `/submit` links stay QUEUED; on restart: `ingest.resumed`, reconcile job, queued submissions processed, no duplicate posts | not yet run |
| Stop Redis | API and worker error; queue jobs retry with backoff after recovery | not yet run |
| Stop the primary RPC | viem falls back to `RPC_URL_BACKUP`; if both are down, indexer stalls without data loss and resumes from its cursor | not yet run |

The scraper-down behaviour is covered by `apps/worker/test/jobs.test.ts` (pause → queued submission → resume → catch-up), but the drill must still be run on the deployed stack.

## Local stack without Docker

`pnpm dev:local` starts in-memory Postgres (PGlite), a fresh anvil with the contracts, the indexer and the API, and seeds one clearly labelled sample market. Then in another terminal:

```bash
NEXT_PUBLIC_CHAIN_ID=31337 pnpm --filter @stampd/web dev
```

Admin wallet = anvil account #0. Import anvil keys into a browser wallet to trade. The local stack refuses to run against anything but a fresh anvil.
