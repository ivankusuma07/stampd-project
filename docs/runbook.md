# Runbook

## Services

| Service | Where | Notes |
|---|---|---|
| `apps/web` | Vercel | Proxies `/api/*` to the API. Set `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. |
| `apps/api` | Railway | Stateless; needs Postgres + Redis. Runs migrations before each deploy. |
| `apps/worker` | Railway | BullMQ worker plus all repeating schedules. Run **one** instance per chain (the indexer and resolver also take Redis locks). |
| `apps/scraper` | Railway, **exactly one replica** | twscrape sessions in SQLite on a volume at `/data`. |
| Postgres | Railway | One `DATABASE_URL` for the app and migrations (D15). |
| Redis | Railway | Queue, SIWE nonces, status flags, notification pub/sub. |

## Deploy the contracts (development plan 1.8 / 7.5)

All inputs come from the root `.env`: `RPC_URL`, `DEPLOYER_PRIVATE_KEY` (deploy only, never on a server), and the
`CREATOR_/RESOLVER_/FAUCET_SIGNER_ADDRESS` of the role keys. `ADMIN_ADDRESS` and `ARBITER_ADDRESS` default to the
deployer on testnet and must be the multisig on mainnet (the script refuses otherwise). Fund the deployer with testnet
ETH first; the deploy costs about 0.0003 ETH at 0.02 gwei, and the script sends the creator and resolver keys
`GAS_TOPUP_ETH` (0.005) each for their own transactions.

```bash
pnpm --filter @stampd/contracts deploy:chain                       # simulate; writes nothing
pnpm --filter @stampd/contracts deploy:chain --broadcast --smoke   # deploy, export addresses, fund roles, one real trade
pnpm --filter @stampd/contracts deploy:chain --broadcast --verify  # (re)submit sources to Blockscout
```

A dry run never writes `deployments/<chainId>.json`; only a broadcast records addresses.

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

## Hosting: Railway (api, worker, scraper, Postgres, Redis) + Vercel (web)

Decided in docs/decisions.md D15. Ready-to-paste variables per service live in the gitignored
`.env.railway.{api,worker,scraper}` and `.env.vercel.web` files at the repo root (regenerate them from `.env` if lost;
never commit them).

**Railway project** — one environment, these services:

| Service | Source | Settings |
|---|---|---|
| Postgres | Railway template | — |
| Redis | Railway template | — |
| scraper | this repo, root directory `apps/scraper` | config file `apps/scraper/railway.json`; **volume at `/data`**; 1 replica; no public domain |
| api | this repo, root directory `/` | config file `/apps/api/railway.json`; generate a public domain; 1+ replicas |
| worker | this repo, root directory `/` | config file `/apps/worker/railway.json`; no public domain; **1 replica** |

- The api runs `prisma migrate deploy` as its pre-deploy step, so the schema is current before new code serves traffic.
- Services talk over the private network (`*.railway.internal`, IPv6): the api listens on `::` and every Redis client
  uses `family: 0`. The worker reaches the scraper at `http://${{scraper.RAILWAY_PRIVATE_DOMAIN}}:8000`.
- Scraper accounts: the local `accounts.db` can't be uploaded to a volume. Add the dedicated accounts again inside the
  container: `railway ssh --service scraper`, then `uv run twscrape add_accounts …` / `uv run twscrape login_accounts`
  (`ACCOUNTS_DB=/data/accounts.db` is already set). Railway's health check uses the unauthenticated `/livez`; the
  worker's `/health` check (with the token) is what reports account health.
- Seed the tracked-KOL list once: `railway run --service api pnpm --filter @stampd/db seed`.

**Vercel project** — import the repo, root directory `apps/web` (`apps/web/vercel.json` sets install/build).
Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in `package.json`. `API_URL` is the api's
**public** Railway URL (Vercel can't reach Railway's private network); the browser only ever calls `/api` on the web
domain, so the SIWE session cookie stays first-party. `NEXT_PUBLIC_*` values are compiled in: redeploy after changing them.

**Order:** contracts (above) → commit `deployments/<chainId>.json` + `packages/chain/src/deployments.generated.ts` →
Postgres + Redis → scraper (add accounts) → api → worker → web → set the api's `SIWE_DOMAIN` / `WEB_ORIGIN` and the
worker's `WEB_URL` to the final web domain → Turnstile and WalletConnect: allow that domain.

**Smoke test after deploy:** `/contracts` shows "code present" five times · faucet claim · one buy and one sell ·
submit a post → approve it in /admin → market appears · notifications arrive live.

**Known limits:** per-IP rate limits read `X-Forwarded-For` (`trustProxy`). Through Vercel that is the real client,
but a caller hitting the api's public URL directly can forge it; the faucet stays protected by Turnstile and the
onchain one-claim-per-wallet-per-day rule. Vercel may cut the long-lived notifications stream through the rewrite;
the browser's EventSource reconnects on its own.

## Database

```bash
pnpm --filter @stampd/db migrate:deploy     # uses DIRECT_URL if set, else DATABASE_URL (Railway: runs as the api pre-deploy step)
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
