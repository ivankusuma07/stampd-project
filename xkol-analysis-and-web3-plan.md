# STAMPD — XKOL Teardown + Build Plan for a Robinhood Chain Prediction-Market Project

> Sources: the public site https://www.xkol.bet (scraped 30 Sep 2026, WIB) **and** a copy of the XKOL codebase (`XKOL-main`, reviewed 30 Sep 2026).
> Tags in Part A: **[Site]** visible on the live site · **[Code]** read in the codebase · **[Inferred]** a conclusion not stated by either. The codebase is a snapshot: the live site may run a newer or older version.

---

## Part A — What XKOL Is

### A1. One-line summary
XKOL watches posts by crypto/finance KOLs on X, turns concrete forward-looking claims ("BTC to 90k before March") into **YES/NO prediction markets**, lets anyone trade them with a **demo USD token**, and **settles every market onchain on Robinhood Chain**, building a permanent track record for each KOL. **[Site] [Code]**

### A2. Core loop
1. **The call** — a KOL posts a concrete, checkable prediction on X. **[Site]**
2. **Ingest** — a Python **twscrape** service pulls the KOL's posts (the code calls it "Pola A"). Supplied JSON/CSV files are the other source. **[Code]**
3. **AI draft** — six AI stages (`detect`, `context`, `extract`, `translate`, `feasibility`, `duplicate`) turn the post into a draft market. Every call is logged. **[Code]**
4. **Human review** — **every** draft lands in a review queue; the code comment says "nothing auto-publishes". An admin approves, and the market is created onchain. **[Code]**
5. **Trade** — users buy YES or NO; price in cents = crowd probability (YES + NO = 100¢). **[Site] [Code]**
6. **Resolve** — a wallet with the resolver role proposes the outcome with an evidence hash → 6-hour dispute window → finalize. **[Code]**
7. **Redeem** — winners pull their payout; INVALID pays 0.50 per share on both sides. **[Code]**

### A3. Feature inventory

| Area | Feature | Status |
|---|---|---|
| **Markets** (`/markets`, `/markets/[id]`) | YES/NO markets, price in cents, volume, countdown, link to the original X post, Watch, Trade Yes / Trade No, price chart, trades tab | [Site] [Code] |
| | Categories: sports, crypto, btc, macro, sol, stocks, eth, tech, defi, ltc, politics | [Site] |
| | "Biggest moves (24h)", "Live market board", live ticker strip, sparklines | [Site] [Code] |
| | Dynamic 1200×630 share images per market **and** per KOL (`opengraph-image` routes) | [Site] [Code] |
| **Feed** | Tabs: Live calls / Following / Trending; each card shows KOL, quoted tweet, market question, YES/NO prices | [Site] |
| **KOLs** (`/kols`, `/kol/[handle]`) | Directory sorted by Trending / Most live / Most markets; live count, resolved count, accuracy % | [Site] [Code] |
| | **Deliberately no global best/worst leaderboard and no "creator score"** (project rule) | [Code] |
| | Roster: **10 hand-picked KOLs + 17 Pump Social creators** (snapshot 2026-09-19). The "Official Creator Key for <name>" text on some profiles is **Pump Social's own description**, imported with the roster | [Code] |
| **KOL Key / Creator Key** (claim your profile) | A creator signs in with a wallet, posts a challenge code on X, then submits the post URL; **an admin verifies it by hand**. States: UNCLAIMED → CLAIM_PENDING → VERIFIED (or SUSPENDED). One wallet per profile; each key gets a permanent ID like `CK-XXXXXX` | [Code] |
| | Verified creators get a badge, a dashboard (`/creator/[handle]`), bio editing, a "request review" of a prediction, share links with `?ref=kol_<handle>` attribution | [Code] |
| **Notifications** | In-app, **for verified creators only** (prediction detected, market published / resolving / resolved, review updated). I found no code that notifies followers, although the site says followers "get pinged" | [Code]; site claim not backed in this snapshot |
| **Callouts** (`/callouts`) | Community takes that must link to a market; like, reply, report; Latest / Trending | [Site] [Code] |
| **History** (`/history`) | Historical calls kept as separate `HISTORICAL_BACKFILL` records that are never tradable before their real creation date | [Site] [Code] |
| **Insights** (`/insights`) | Counts, YES / NO / INVALID split, markets by category, method notes; accuracy always shown **with sample size**, INVALID counts as resolved but never correct | [Site] [Code] |
| **Account** | Wallet connect + sign-in with Ethereum (SIWE), Portfolio, Profile, Following | [Site] [Code] |
| **Platform** | Activity feed, global search | [Site] [Code] |
| **Faucet** (`/faucet`) | Demo USD (USDG), rate-limited onchain per address per 24h | [Site] [Code] |
| **Contracts** (`/contracts`) | Every contract with address, creation tx, explorer link, and a live bytecode check from the visitor's browser | [Site] [Code] |
| **Admin** (`/admin`) | Review queue, KOL management, market management, resolutions with evidence, key (claim) approvals, users, alerts, audit log | [Code] |
| **Header** | Live Robinhood Chain block number | [Site] |
| **Social** | X account @xkolmarket | [Site] |

At scrape time the homepage board showed ~24 live markets and Insights reported 72 historical tracked predictions. **[Site, snapshot]** The mainnet deploy notes mention a purge on 2026-09-24 that left 15 markets with real X posts, so the number moves. **[Code]**

### A4. Onchain architecture

Network: **Robinhood Chain mainnet, Chain ID 4663**, deploy block **71,519,631**. Explorer: Blockscout. `deployments/4663.json` in the code matches the live Contracts page exactly. **[Site] [Code]** Solidity 0.8.24, Foundry, OpenZeppelin. **[Code]**

| Contract | Address | What it does | Settings |
|---|---|---|---|
| **MarketHub** | `0xb8e8b4baf7010338aa1243444ef2be4b44af5a53` | One contract holding every market's state: buy, sell, split/merge complete sets, close, redeem, per-market pause, admin cancel | `maxFeeBps = 1000` (fee cap 10%) |
| **MarketFactory** | `0x98a0bfb1db7405690daa178863483d1d64672585` | `createMarket`, restricted to `MARKET_CREATOR_ROLE`; seeds liquidity and opening odds | — |
| **Resolver** | `0xcb405b48121788faef59c54ed5ea8f9eb803ead5` | `propose` (needs an evidence hash), `dispute`, `finalize` | `disputeWindowSec = 21600` (6 h) |
| **OutcomeTokens** | `0x52db7f9398e18507489df25481e0f3b223cb30ba` | ERC-1155 YES/NO shares; token ID = `keccak256(marketId, outcome)` | — |
| **Usdg** | `0xd982d99e76837a19868707b876c29a147c7bb261` | Demo USD, 6 decimals, faucet `mint` limited per address per 24h; owner can change the limit and pause | — |

How it actually works **[Code]**:
- **Pricing:** a direct port of the Gnosis fixed-product market maker (FPMM): `P(YES) = Rn / (Ry + Rn)`, opening odds set by uneven seeding, rounding in the pool's favour, fuzz and invariant tests. The TypeScript quote math in `packages/core` is tested to match the contract to the wei.
- **Market IDs:** each market has a `bytes32` onchain ID, separate from the CUID used in URLs.
- **Resolution is permissioned, not open:**
  - only `RESOLVER_ROLE` can propose, only `DISPUTE_ROLE` can dispute, and neither posts a bond;
  - a dispute cancels the proposal and returns the market to CLOSED for a new proposal;
  - the proposer can never finalize their own proposal; anyone else can finalize after the window.
- **Admin control:** the mainnet deploy notes say the Usdg owner, market-creator role and pause role all sit on **one deployer wallet**, with a note to move them to a Safe multisig "if people start using it".
- **Fees:** each trade charges `feeBps`; the fee stays inside MarketHub. This snapshot has **no function to withdraw collected fees and none to withdraw leftover seed liquidity** after resolution.
- **Demo money on mainnet** is a stated product decision ("demo economy on mainnet chain"). **[Code]**
- **The homepage "CA" pill is not MarketHub.** `0x7adCFaa99D0E60Ba635E453aeAdAEEcfF4db3C72` is hardcoded as "the official CA from the PM", separate from the deployed contracts. **[Code]** Given the planned $XKOL token (A6), it is probably the token's address. **[Inferred]**

### A5. Tech stack

| Layer | What they use | Status |
|---|---|---|
| Monorepo | pnpm + Turborepo: `apps/web`, `apps/worker`, `apps/api` (stub), `packages/contracts`, `chain`, `db`, `ai`, `core`, `ui` | [Code] |
| Web | **Next.js 14 (App Router)**, React 18, TypeScript, Tailwind 3, Radix UI / shadcn, SWR + TanStack Query, Recharts, Framer Motion | [Code] |
| API | Next.js route handlers with Zod validation and rate limits; the separate Fastify `apps/api` is a stub until there are ~30 routes | [Code] |
| Wallet | wagmi v2 + viem with a **local injected-wallet connector** (no RainbowKit) and SIWE sessions; admin access by wallet allowlist | [Code] |
| DB | Prisma 5 + Postgres on Supabase; money stored as `NUMERIC`/`Decimal`, never JS numbers; CUID IDs | [Code] |
| Worker | Scripts run with `tsx`: live indexer, backfill, reconciliation, ingest. The docs mention BullMQ, but it isn't a dependency in this snapshot | [Code] |
| Indexer | Own indexer: cursor, confirmations and reorg handling, idempotent on `(txHash, logIndex)`, full rebuild from chain with `indexer:backfill`, reconciliation that raises `SystemAlert`s | [Code] |
| X ingestion | `ScraperSource` → Python **twscrape** service (`services/scraper`, **not included** in the zip); `FileImportSource` for JSON/CSV; the official X API source is an **unimplemented stub** | [Code] |
| AI | Provider-agnostic wrapper; **Gemini `gemini-flash-lite-latest`** (free tier) or a rule-based `heuristic` provider; every call logged to `AIAnalysis` | [Code] |
| Hosting | Vercel (web) + Supabase; local Docker Postgres/Redis for dev | [Code] |
| Explorer | Blockscout | [Site] [Code] |
| Quality gates | `pnpm verify` = lint, typecheck, tests, `forge test`, Slither, and a **forbidden-copy check** that fails the build on phrases like "worst predictor" or "bad call" | [Code] |
| Design | Light theme, emerald brand colour, Inter/Geist with tabular numbers, terminal-style accents on the site | [Site] [Code] |

### A6. Planned, not built (from their dev briefs)
- **Fee → $XKOL token buyback** (FeeRouter, BuybackVault, BuybackExecutor). The contracts are **not deployed**; a `buyback:show` script replays the feature for a terminal video and labels itself "SIMULATION". This is the only sign of an XKOL token. **[Code]**
- **Creator Key evolution** — a fuller creator identity layer and prediction portfolio, marked "Post-Mainnet Evolution". **[Code]**
- Automated claim verification through the X API (today it's manual). **[Code]**

### A7. Things to be careful about
- **Displayed activity may not all be organic.** The repo has tools that make it look busier: `tape-onchain.ts` places real trades from the deployer wallet (testnet) to move prices off 50¢, and `backfill-demo.ts` reconstructs history in the database only, with "a believable probability walk" and "bot trades". `seed-activity.ts` does the same on a local chain. I can't tell which ran on the live site. **[Code]; effect on live numbers unknown**
- **Key handling:** their notes say the old deployer key was exposed in `.env` (a new one was planned for mainnet) and API keys were pasted into a chat. **[Code]**
- **No LICENSE file**, so by default all rights are reserved. Use the code to learn from, not to copy. **[Code]**
- **Incomplete copy:** `services/scraper` (the twscrape service) isn't in the zip. **[Code]**
- The market wording is uniform ("Will X … before <date>?") with shared default deadlines, and at least one market came from hype ("SENDING IT TO 120M") rather than a dated prediction, so the human review doesn't catch everything. **[Site] [Inferred]**

### A8. Similar projects (not yet analysed)
- **KOL Predict** (kolpredict.bet), tagline "Bet on Influence". The site returned server errors when checked; the tagline suggests betting on KOL influence metrics rather than their calls. **[Inferred]**
- **kolbets** (@kolbets on X). X blocks automated reading; no website found. **[Unknown]**

See review item V9 (B12).

---

## Part B — Build Plan: STAMPD on Robinhood Chain

Project name: **STAMPD** (decided 30 Sep 2026). Positioning: *KOL call → market → onchain receipt*, but with clear differentiators (B2) so it isn't a clone.

### B1. Robinhood Chain facts you'll build against **[Confirmed — official docs]**

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | **4663** | **46630** |
| Public RPC (rate-limited) | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Alchemy RPC | `https://robinhood-mainnet.g.alchemy.com/v2/{KEY}` | `https://robinhood-testnet.g.alchemy.com/v2/{KEY}` |
| WebSocket | `wss://robinhood-mainnet.g.alchemy.com/v2/{KEY}` | `wss://robinhood-testnet.g.alchemy.com/v2/{KEY}` |
| Explorer | `robinhoodchain.blockscout.com` | `explorer.testnet.chain.robinhood.com` |
| Gas token | ETH | ETH |
| Stack | Arbitrum L2, Ethereum blobs for DA; fully EVM-compatible | same |

Other RPC providers: Chainstack, QuickNode, Blockdaemon, dRPC, Validation Cloud, GlobalStake. Indexer with native support: Envio.

Verification (Foundry):
```bash
forge verify-contract <ADDR> src/MarketHub.sol:MarketHub \
  --chain-id 4663 \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/
```

### B2. Differentiators

**Filter used:** every v1 item must work with (a) demo collateral, (b) X data from twscrape only (B6b), (c) your existing stack, and (d) **no extra smart-contract risk**. Anything that fails one of these moves to "Later".

#### v1 — build now

| # | Feature | How it works | X data cost | Effort |
|---|---|---|---|---|
| 1 | **Paste-a-link submission** (web) | `/submit`: paste a tweet URL → fetch that one post by ID via twscrape → LLM draft → moderation (B10a) → submitter credited on the market page and gets points. Limit 5 submissions per wallet per day. | $0 (twscrape) | 3–4 days |
| 2 | **Edge score** (replaces the Brier idea) | KOLs don't state probabilities, so Brier isn't computable. Instead, score each resolved call against the crowd: `edge = outcome − p`, where `outcome` is 1 if the KOL was right and 0 if wrong, and `p` is the market's price of the KOL's side (24h TWAP after opening, so your seeded odds don't count). Shown as average edge **with n**, next to hit rate. Being right on a 20¢ call scores +0.80; being wrong on an 80¢ call scores −0.80. | none (your own data) | 2–3 days |
| 3 | **Receipt cards + in-app notifications** | Dynamic OG image per market and per resolution ("Called it ✅ / Missed ❌", KOL, question, final price, tx hash) that users share themselves. In-app notifications (bell icon + `/notifications`, live via Supabase Realtime) for: new market on a followed KOL, watched market resolved, winnings ready to redeem, and submission approved/rejected. | none | 3–4 days |

#### Later — needs real collateral or an external dependency
- **Creator fee share** — needs real-value collateral (legal review, B10) and a fee-split change in `MarketHub` plus audit.
- **Tokenized-stock markets** — needs a price source you can cite in the rules (oracle on Robinhood Chain or licensed market data). Confirm availability before promising it.
- **Onchain-verified resolution for chain tokens** (e.g. memecoin market caps) — needs the main DEX pools on Robinhood Chain identified and a TWAP method that resists manipulation.
- **External liquidity providers** — needs LP accounting in contracts and an audit.

### B2a. How each feature works, step by step

#### Core 1 — From a KOL post to a live market
1. **Schedule.** The worker queues a "fetch timeline" job for each tracked KOL (busy KOLs more often, jobs spread out).
2. **Fetch.** The scraper calls twscrape `user_tweets`, walks newest → oldest, and stops at the first post ID already stored. Only new posts come back.
3. **Store.** New posts are saved to `posts` (deduped by post ID).
4. **Pre-filter (cheap).** Skip replies, reposts and posts with no forward-looking words, numbers or dates, so the LLM only sees likely predictions.
5. **Extract.** The LLM returns JSON: is it a prediction, subject (e.g. BTC), metric (daily close), comparator (≥), threshold ($90,000), deadline (UTC), data source, question, rules, category, and the KOL's side (YES/NO).
6. **Moderate (B10a).** Code validators → second AI check → auto-publish, human review queue, or auto-reject.
7. **Create onchain.** On approval, the creator key calls `MarketFactory.createMarket` with the rules hash, source post ID, close time, fee and seed amount. The factory funds the pool at 50¢ or the chosen starting odds.
8. **Index.** The indexer sees `MarketCreated`, links it to the prediction, and the market appears on the site with the tweet embedded and the rules shown.
9. **Notify.** Followers of that KOL get an in-app notification (feature 3).

#### Core 2 — Trading
1. The user connects a wallet on Robinhood Chain and gets demo USD from `/faucet` (captcha + onchain limit of one claim per window).
2. On a market page they pick YES or NO and enter an amount. The UI calls `quoteBuy` (read-only) to show shares, average price, price impact and fee.
3. First trade only: approve demo USD for `MarketHub`.
4. They confirm `buy(marketId, outcome, amountIn, minOut)`. The FPMM math (B5) sets the shares; `minOut` protects against slippage.
5. `MarketHub` mints ERC-1155 YES/NO shares to the wallet and emits `Trade`. The price moves.
6. The indexer updates the price, volume, chart and `/portfolio`. Selling works the same way in reverse with `sell(…, maxIn)` until `closeTime`, after which trading is blocked onchain.

#### Core 3 — Resolution and payout
1. At the deadline, the resolver bot reads the data source named in the rules (e.g. the Coinbase BTC-USD daily close at 00:00 UTC).
2. It calls `Resolver.propose(marketId, YES | NO | INVALID, evidenceURI)` with a bond. The evidence (source URL, value, timestamp) is pinned to IPFS.
3. A 6-hour dispute window opens. Anyone can `dispute` by posting a matching bond; the arbitrator multisig then decides.
4. With no dispute, `finalize` settles the market. The indexer updates the KOL's hit rate and edge score.
5. Holders click **Redeem**: winning shares pay 1.00 demo USD each, losing shares 0, and INVALID pays 0.50 per share on both sides.
6. Watchers and holders get an in-app notification, and a receipt card is generated.

#### Feature 1 — Paste-a-link submission (`/submit`)
1. A connected user pastes a tweet URL. The app extracts the post ID and rejects anything that isn't an x.com/twitter.com status link.
2. Checks: 5 submissions per wallet per day, and whether the post is already a market (if so, it shows a link to it).
3. If the post isn't stored yet, the API asks the scraper for `/post/{id}`. If the scraper is down, the submission is saved as `queued` and retried after recovery.
4. The post goes through the same extract → moderate path as Core 1, tagged `source = web` with the submitter's wallet.
5. The user sees the status in their submissions list: queued → in review → approved or rejected, with the reason.
6. If approved, the market page shows "Submitted by <wallet or display name>", the submitter earns points, and they get an in-app notification.

#### Feature 2 — Edge score
1. When a market opens, the system records the KOL's side (usually YES, since the question is written from their call).
2. For the first 24 hours it samples the price of that side and stores the time-weighted average as `p`. This ignores your seeded opening odds.
3. At resolution: `outcome` = 1 if the KOL was right, 0 if wrong. INVALID markets are left out and counted separately.
4. The market only counts if it had at least ~10 captcha-verified unique traders in its first 24 hours.
5. Edge for the call = `outcome − p`. Example: right on a call the crowd priced at 30¢ → +0.70; wrong on a call priced at 70¢ → −0.70.
6. The KOL's score is the average edge over counted calls, always shown with n (e.g. "+0.12 · 18 calls"). Positive means they beat the crowd; the leaderboard can sort by hit rate or by edge.

#### Feature 3 — Receipt cards + in-app notifications
**Receipt cards**
1. Every market has a Next.js `opengraph-image` route that draws a 1200×630 card: KOL avatar and handle, the question, current YES price, and close date.
2. After resolution the same route draws the result version: "Called it ✅" or "Missed ❌", final price, and a shortened settlement tx hash.
3. A **Share** button copies the link or opens the device share sheet. When the link is posted on X or elsewhere, the card shows automatically; you post nothing yourself.

**In-app notifications**
1. Users follow KOLs and watch markets (stored in `follows` and `watchlist`).
2. When something happens — new market on a followed KOL, a watched market resolves, winnings become redeemable, or a submission is approved/rejected — the notifier writes a row to `notifications` for each affected wallet.
3. The web app subscribes to that user's rows through Supabase Realtime, so the bell's unread count updates live without a refresh.
4. Clicking a notification opens the market or portfolio and marks it read. `/notifications` keeps the history.
5. Notifications only appear while the user has the site open or next time they visit; nothing is sent outside the app.

### B3. Architecture

```
            ┌───────────────┐   twscrape (KOL timelines, single posts)
            │  Ingest worker│◄── web /submit (tweet URL)
            └──────┬────────┘
                   │ raw posts
            ┌──────▼────────┐   LLM: is it a checkable claim? extract
            │ Claim extractor│  subject, threshold, deadline, data source,
            └──────┬────────┘   draft question + resolution rules (JSON)
                   │ drafts
            ┌──────▼────────┐
            │ Moderation     │  validators + AI check + human review (B10a)
            └──────┬────────┘
                   │ approved → tx
   ┌───────────────▼──────────────────────────────────────────────┐
   │ Robinhood Chain: MarketFactory → MarketHub ↔ OutcomeTokens    │
   │                  Resolver (optimistic, dispute window)       │
   └───────────────┬──────────────────────────────────────────────┘
                   │ events
            ┌──────▼────────┐        ┌───────────────┐
            │  Indexer       │──────►│ Postgres      │◄── Next.js web + API
            └───────────────┘        └───────┬───────┘   (in-app notifications
                   ▲                         │            via Supabase Realtime)
            ┌──────┴────────┐  price feeds / APIs at deadline
            │ Resolver bot  │  → propose outcome onchain
            └───────────────┘
```

No official X API and no fallback data provider anywhere in the system.

### B4. Tech stack (reuses your Robinchan monorepo so you ship faster)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm + Turborepo: `apps/web`, `apps/api`, `apps/worker`, `apps/scraper`, `packages/contracts`, `packages/shared` | Same shape as Robinchan, plus the scraper |
| Web | **Next.js (App Router)** + TypeScript + Tailwind | SSR/SEO for market pages, `opengraph-image` for receipt cards, and shares code with Robinchan. (Nuxt + `@wagmi/vue` is viable if you prefer Vue, but you lose RainbowKit.) |
| Wallet | wagmi + viem + RainbowKit | Already in your stack; define Robinhood Chain via viem `defineChain` (id 4663 / 46630) |
| API | Fastify | Same as Robinchan |
| DB | Supabase Postgres + Prisma (or Drizzle) | Relational data; Supabase Realtime for live prices and in-app notifications |
| Cache / queues | Upstash Redis (+ BullMQ or QStash for jobs) | Rate-limit, job queue for ingest/resolve |
| Indexer | **Envio HyperIndex** (native Robinhood Chain support) — or a viem `watchContractEvent` log-poller in `apps/worker` for MVP | Event → DB |
| Contracts | Solidity ^0.8.24, **Foundry**, OpenZeppelin v5 (ERC1155, AccessControl, ReentrancyGuard, Pausable, SafeERC20) | Official docs recommend Foundry |
| LLM | Claude Haiku 4.5 for claim extraction / classification; route ambiguous cases to a stronger model or a human | Cheap at volume |
| X data | **twscrape only**, in a small Python service (`apps/scraper`) — see B6b. No official X API, no fallback provider. | Cheapest option. It breaks X's terms and carries legal and operational risk (R6, R25–R28) |
| Scraper service | Python 3.11+, FastAPI, twscrape (pinned version), SQLite `accounts.db` on a persistent volume, **single instance** | twscrape keeps account sessions in SQLite, which doesn't suit multiple writers |
| Anti-sybil (faucet) | Captcha (e.g. Cloudflare Turnstile) + per-wallet/IP limits on top of the onchain faucet limit | No X login is available without the official API |
| Resolution data | Exchange candle APIs (e.g. Coinbase/Binance daily close, UTC), CoinGecko, onchain DEX TWAP for chain tokens | Must be named in each market's rules |
| Hosting | Vercel (web), Fly.io/Railway (api + worker + scraper with a volume) | |
| Monitoring | Sentry + email alerts to you (scraper health, failed resolutions, disputes) | |

### B5. Smart contracts

#### Token IDs
`id = (marketId << 1) | outcome` where `outcome ∈ {0 = NO, 1 = YES}`. One ERC-1155 contract holds every market.

#### Pricing: binary FPMM (constant-product, Gnosis-style)
Pool holds YES reserve `y` and NO reserve `n`; invariant `k = y · n`.
- **Price** of YES = `n / (y + n)`; NO = `y / (y + n)`; they sum to 1.
- **Buy YES with collateral `a`** (after fee): mint `a` YES + `a` NO (a complete set), both into the pool → `(y + a, n + a)`; pool must end with `y' = k / (n + a)`; user receives `(y + a) − y'` YES.
  - Example: `y = n = 100`, `a = 10` → `y' = 10000 / 110 = 90.909` → user gets **19.09 YES** (avg 52.4¢). ✔
- **Sell YES for collateral `r`** (before fee): pool burns `r` complete sets → reserves `(y − r, n − r)`; user must deposit `t = k / (n − r) − (y − r)` YES.
- **Seeding custom odds** (e.g. start at 60¢ YES): fund `L` collateral → mint `L` of each; send surplus of the outcome you want *expensive* back to the LP so reserves match the target ratio (`price_yes = n / (y + n)`).
- Liquidity is protocol-owned in v1 (treasury funds each market); external LPs later.

Why FPMM over LMSR: no `exp/ln` fixed-point math, well-studied, simple to audit. LMSR's bounded loss is nice but adds complexity you don't need for v1.

#### Contracts
| Contract | Responsibilities |
|---|---|
| `OutcomeTokens` (ERC-1155) | `mint/burn` restricted to `MarketHub` (`MINTER_ROLE`) |
| `MarketFactory` | `createMarket(questionHash, sourcePostId, closeTime, resolveBy, feeBps, seedAmount, initialYesPriceBps)` — `CREATOR_ROLE` only; pulls seed collateral; emits `MarketCreated` |
| `MarketHub` | `quoteBuy / quoteSell` (view), `buy(marketId, outcome, amountIn, minOut)`, `sell(marketId, outcome, amountOut, maxIn)`, `redeem(marketId)`; `maxFeeBps` immutable cap; trading blocked after `closeTime`; `nonReentrant`, `whenNotPaused` |
| `Resolver` | `propose(marketId, outcome, evidenceURI)` with bond; `dispute(marketId)` with matching bond inside `disputeWindowSec`; `finalize(marketId)` after window; disputed → `ARBITER_ROLE` (multisig) decides; outcomes: `YES`, `NO`, `INVALID` |
| `Collateral` | **v1: demo USD (6 decimals) with onchain faucet rate limit** — same approach as XKOL. Real collateral (e.g. USDC on the chain) only after legal review (B10). |

Redemption: winning share → 1.00 collateral; losing → 0; **INVALID → 0.50 per share of either side**.

Store `questionHash = keccak256(canonical JSON of question + rules + source post URL)` onchain and pin the JSON to IPFS/Arweave, so rules are provably immutable (XKOL's "cannot be edited after the fact" claim, made verifiable).

#### Events (drive the indexer)
`MarketCreated(id, questionHash, sourcePostId, closeTime, feeBps)`, `Trade(id, trader, outcome, isBuy, collateral, shares, fee, priceAfterBps)`, `OutcomeProposed(id, outcome, proposer, evidenceURI)`, `Disputed(id, disputer)`, `Resolved(id, outcome)`, `Redeemed(id, user, payout)`.

#### Security checklist
- Foundry unit + **fuzz + invariant tests**: pool invariant `y·n ≥ k` after every trade; total collateral held ≥ max possible payout; YES supply == NO supply per market (minus pool asymmetry accounted for).
- Rounding always against the user (round `out` down, `in` up); 6-decimal collateral means dust math matters.
- Slippage params (`minOut` / `maxIn`) and a `deadline` on every trade.
- Admin keys in a multisig with a timelock for fee/role changes; `Pausable` for emergencies. Confirm which multisig tooling is deployed on Robinhood Chain before choosing.
- Static analysis (Slither), then an external audit **before** any real-value collateral.
- Deploy to **testnet 46630 first**, verify on Blockscout, then mainnet.


### B6. Off-chain services

**1. Ingest worker** (Node, BullMQ) — details of the scraping layer in **B6b**
- Tracked-KOL list (start with ~50 handles) → one "fetch timeline" job per KOL, sent to `apps/scraper`.
- twscrape has no `since_id`: the scraper fetches the newest page and stops at the first post ID already in the DB, so only new posts come back.
- Poll busy KOLs more often than quiet ones and spread jobs out instead of firing them all at once.
- Cache user profiles (name, avatar) in the DB; refresh at most daily to keep load on the account pool low.
- Store raw post (id, author, text, created_at, media, URL). Never store more than you need.

**1b. Web submissions** (differentiator #1)
- `/submit` parses the post ID from the URL and checks the DB first. If unseen, it fetches the post via the scraper's `/post/{id}`, then drafts as above with `source = web`.
- If the scraper is down, the submission is saved as `queued` and processed automatically when ingest recovers; the submitter sees "queued" in their submissions list.

**2. Claim extractor (LLM)**
- Output strict JSON: `{ is_prediction, subject, metric, comparator, threshold, deadline_utc, resolution_source, question, rules, category, kol_side, confidence }`.
- Reject vague claims ("Hype will go to triple digits" with no date → needs a default horizon rule or rejection).
- Always cite the source post. Routing between auto-publish, human review and auto-reject follows **B10a**.

**3. Resolver bot**
- At `resolveBy`, fetch the named source (e.g. BTC-USD daily close, 00:00 UTC, named exchange), propose onchain with evidence URI.
- Email alert on any dispute.

**4. Notifier** (differentiator #3)
- Listens to DB changes (new market, resolution finalized, submission status) and writes rows to `notifications` for the affected users (followers of the KOL, watchers of the market, holders of positions, the submitter).
- The web app subscribes through Supabase Realtime so the bell updates live; `/notifications` lists history with read/unread state.

**5. Indexer** → Postgres tables below.

### B6a. X data cost

- **No official X API is used.** All X data comes from twscrape, which has no per-post charge.
- **Running cost:** scraper VM + persistent volume ≈ **$5–10/month**. Not included: the X accounts used by the scraper pool.
- **For comparison:** reading the same ~30,000 posts/month through the official X API would cost ~$150/month at $0.005 per post read.

### B6b. Ingest layer with twscrape

**What twscrape is:** an async Python library that reads X through X's internal web API (GraphQL/Search), logged in as real X accounts. It keeps sessions in a SQLite file and switches accounts when one hits a rate limit. Methods used here: `user_tweets`, `tweet_details`, `user_by_login`. Its README warns that X's terms discourage using multiple accounts.

```
 ┌────────────────────────── apps/worker (Node) ──────────────────────────┐
 │ Scheduler (BullMQ): per-KOL "fetch timeline" jobs, spread out          │
 │ ScraperClient → HTTP → apps/scraper                                    │
 │ Health guard: errors or empty results spike → pause ingest jobs,       │
 │ email alert, retry after a cool-down                                   │
 └────────────┬───────────────────────────────────────────────────────────┘
              ▼ normalized XPost
       dedupe by post ID → Postgres `posts` → claim extractor → B10a → MarketFactory

 ┌──────────── apps/scraper (Python, single instance) ────────────┐
 │ FastAPI                                                         │
 │   GET /timeline/{user_id}?after_id=…   → twscrape user_tweets   │
 │   GET /post/{id}                       → twscrape tweet_details │
 │   GET /user/{handle}                   → twscrape user_by_login │
 │   GET /health  → active / locked account counts, last success   │
 │ twscrape (pinned) + accounts.db (SQLite on a persistent volume) │
 └─────────────────────────────────────────────────────────────────┘
```

Shared types (TypeScript, `packages/shared`):
```ts
type XPost = {
  id: string; authorId: string; authorHandle: string; text: string;
  createdAt: string; url: string; replyToId?: string; quotedId?: string;
};
type XUser = { id: string; handle: string; name: string; avatarUrl: string };
```

Operating rules:
- **Accounts:** the pool uses dedicated accounts only. Never log the scraper in with your personal or brand account, and keep their credentials separate.
- **Health:** the worker polls `/health`; email alert when active accounts drop below a threshold or there's been no successful fetch for 30 minutes.
- **Canary check:** a daily fetch of one known public account's latest post; failure pauses ingest and alerts you.
- **Reconciliation:** once a day, and after every outage, re-fetch each KOL's latest page to catch missed posts.
- **Upgrades:** pin the twscrape version; watch the repo. When X changes its internals, ingest stops until you upgrade — there is no fallback.
- **What an outage affects:** only new market creation and `/submit` (queued). Trading, resolution, redemption and notifications don't depend on X and keep working. Show a small "new markets paused" banner while ingest is down.
- **Never for resolution:** scraped data only discovers predictions. Market outcomes come from the named data sources in each market's rules.
- **Kill switch:** one config value stops all scraping immediately, e.g. after a legal notice from X.

### B7. Data model (Postgres)

| Table | Key columns |
|---|---|
| `kols` | id, x_handle, x_user_id, name, avatar_url, excluded (set by admin after a takedown request) |
| `posts` | id, kol_id, x_post_id, text, posted_at, url |
| `predictions` | id, post_id, extracted_json, status (draft/approved/rejected), reviewer_id, source (timeline/web), submitted_by |
| `submissions` | id, wallet, x_post_url, x_post_id, status (queued/drafted/approved/rejected), created_at |
| `markets` | id (cuid), onchain_id, prediction_id, question, rules_json, question_hash, category, close_time, resolve_by, status, outcome, yes_price_bps, volume, kol_side (YES/NO), kol_side_twap24h_bps |
| `trades` | tx_hash, log_index, market_id, wallet, outcome, side, collateral, shares, fee, price_after_bps, block_time |
| `positions` | wallet, market_id, yes_shares, no_shares, cost_basis, realized_pnl |
| `resolutions` | market_id, proposed_outcome, proposer, evidence_uri, disputed, final_outcome, finalized_at |
| `users` | wallet, display_name (optional), points, created_at |
| `follows` | user_wallet, kol_id |
| `watchlist` | user_wallet, market_id |
| `notifications` | id, user_wallet, type (new_market/resolved/redeemable/submission), ref_id, read_at, created_at |
| `callouts` | id, user_wallet, market_id, side, text, created_at, likes |
| `kol_stats` (materialized) | kol_id, live, resolved, correct, invalid, hit_rate, avg_edge, edge_n, sample_size |
| `ingest_runs` | id, job_type, kol_id, started_at, status, posts_returned, error |

Edge rules: a market counts toward `avg_edge` only if it resolved YES/NO (INVALID excluded, shown separately) and met a minimum activity threshold in its first 24h (e.g. ≥ 10 unique traders that passed the faucet captcha), so thin demo-money markets don't distort scores.

### B8. Frontend pages

| Route | Contents |
|---|---|
| `/` | Hero, live feed (Live / Following / Trending), biggest 24h moves, market board, featured predictions, top KOLs |
| `/markets` | Filter by category/status, sort by volume/closing soon/moves |
| `/markets/[id]` | Question, source tweet embed, rules + data source, price chart, trade panel (amount, est. shares, avg price, price impact, fee, slippage), activity, holders, resolution status + tx links, submitter credit, share receipt card |
| `/kols`, `/kol/[handle]` | Leaderboard (hit rate **with n**, avg edge **with n**), profile with all calls live/resolved |
| `/submit` | Paste a tweet URL → draft preview → "sent for review"; your submissions and their status |
| `/notifications` | Notification history, mark as read (bell icon in the header shows the unread count live) |
| `/callouts` | Community takes, Latest/Trending |
| `/portfolio` | Open positions, P&L, redeemable winnings (one-click redeem) |
| `/faucet` | Demo-USD claim (captcha + onchain rate limit) |
| `/contracts` | Addresses, creation txs, live `eth_getCode` check from the browser — copy this transparency idea |
| `/insights` | Totals, YES/NO/INVALID split, per-category counts, methodology |
| `/takedown` | Request form for KOLs to have markets on their posts reviewed or excluded |
| `/admin` | Review queue, create market tx, resolution monitor, scraper health, takedown requests |

Global: search, wallet connect, notification bell, live block number, network switch prompt (4663 / 46630).

### B9. Milestones

| # | Milestone | Deliverables | Est. |
|---|---|---|---|
| M0 | Setup | Monorepo, chain config for 4663/46630, CI, Supabase, envs | 3–4 days |
| M1 | Contracts v1 | OutcomeTokens, MarketHub (FPMM), Factory, Resolver, demo USD + faucet; full Foundry tests incl. invariants; deployed + verified on **testnet** | 2–3 weeks |
| M2 | Indexer + API | Event indexing, trades/positions/markets APIs, KOL stats job | 1–1.5 weeks |
| M3 | Web MVP | Home, markets, market detail + trading, portfolio, faucet (captcha), contracts page | 2–3 weeks |
| M4 | Ingest + AI + admin | `apps/scraper` (twscrape + FastAPI), health guard + alerts, **`/submit`** with queueing, LLM extraction, moderation (B10a), admin approval → onchain create | 2–2.5 weeks |
| M5 | Resolution | Resolver bot, dispute flow, INVALID handling, redemption UI | 1 week |
| M6 | Social | KOL pages with **edge score**, follow, callouts, **receipt OG cards**, **in-app notifications**, `/takedown` | 1–1.5 weeks |
| M7 | Hardening + mainnet | Slither, external review, mainnet deploy + verify, monitoring, launch with seeded markets on ~20 KOLs | 1–2 weeks |

Total: roughly **11–15 weeks** solo; faster if you reuse Robinchan's wallet/UI packages.

### B10. Risk register

Likelihood / impact: **H** high, **M** medium, **L** low. These are my assessments for a solo launch with demo collateral, not measured data; re-rate them after testnet.

#### Legal and regulatory
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Product is classed as gambling or a derivatives market (Indonesia prohibits gambling; in the US, event contracts fall under CFTC rules) | M | H | Demo collateral only; no cash-out path; get a legal opinion **before** any real value. I'm not a lawyer. |
| R2 | Demo USD or points **gain real value** (listed on a DEX, promised airdrop, redeemable rewards), which can turn "play money" into value in a regulator's eyes | M | H | Restrict demo USD transfers to protocol contracts; never list it; make no airdrop/reward promises tied to trading until legal review. |
| R3 | A KOL complains about being named, or a question wording reads as defamatory | M | M | Neutral wording, source quote on every market, `/takedown` form + `excluded` flag, pause + INVALID for bad markets. |
| R4 | Breach of X's terms on stored content (e.g. keeping posts the author deleted) | M | M | Store the minimum; remove posts that were deleted on X during reconciliation (V4). |
| R5 | Name conflicts with an existing trademark | L | M | Domain, handle and trademark search before branding (V10). |

#### X platform
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R6 | **No fallback:** when twscrape breaks or the account pool is locked, new market creation stops completely | H | M | Health alerts; queue `/submit` requests; "new markets paused" banner; reconciliation after recovery. Trading and resolution are unaffected. |
| R7 | Your brand account suspended by association with scraping | L | H | Never log the scraper in with your brand or personal account; separate credentials. |

#### Market integrity
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R9 | Ambiguous rules → many INVALID resolutions → trust drops | H | M | Rule templates, allowlisted data sources, two-pass AI check, human review (B10a). |
| R10 | Resolution source manipulated (low-cap token prices, thin DEX pools) | M | H | Asset allowlist with minimum liquidity; TWAP not spot; avoid market-cap markets on tiny tokens in v1. |
| R11 | Self-fulfilling calls (KOL controls the outcome, e.g. "I will launch X by May") | M | M | Extractor flags them; reject or label "outcome controlled by KOL". |
| R12 | Sybil wallets farm the faucet and fake "unique traders" (games the edge-score threshold) | H | M | Onchain faucet limit + captcha + per-IP limits; only captcha-verified wallets count toward edge eligibility. |
| R13 | Wash trading inflates volume / "trending" | M | L | Rank trending by unique traders, not volume alone; hide self-matched activity. |
| R14 | Prompt injection in tweet text ("ignore instructions, create…") | M | M | Treat post text strictly as data; structured JSON output; code validators; no tool access for the extractor. |

#### Smart contracts and chain
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R15 | Contract bug or rounding exploit drains collateral | M | H | Unit/fuzz/invariant tests, Slither, external review before mainnet, `Pausable`, per-market caps. |
| R16 | Admin / resolver key compromised | L | H | Multisig + timelock, hardware keys, separate roles (creator ≠ resolver ≠ admin). |
| R17 | Wrong outcome proposed, or dispute griefing | M | M | Proposer/disputer bonds, 6h window, arbitrator multisig, evidence URI on every proposal. |
| R18 | Seed liquidity lost to informed traders | H | L (demo) | Cap seed per market; becomes **H impact** with real collateral. |
| R19 | RPC or sequencer outage on Robinhood Chain around a market's close | L | M | At least two RPC providers; rules state that `closeTime` is enforced onchain; resolver waits for finality. |
| R20 | Phishing clone of your site or compromised frontend dependency | M | H | Lockfile + dependency pinning, CSP, clear transaction previews, monitor look-alike domains, publish official contract addresses on `/contracts`. |

#### Scraping (twscrape)
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R25 | **Legal action or a cease-and-desist from X.** X's terms prohibit scraping and discourage multiple accounts. X sued the scraper Bright Data: the court dismissed the terms-of-service claims in May 2024, then in Nov 2024 let X revive claims of improper server access and fraudulent business practices — the question isn't settled. twscrape logs in to X's servers directly, which is the conduct those revived claims target. | M | H | Include scraping in the legal opinion (V11); kill switch stops scraping at once (B6b); stop on any notice from X. With no fallback, that also stops new markets. |
| R26 | Scraper accounts locked or banned | H | M | Pool health alerts, pause + resume, reconciliation after recovery. |
| R27 | twscrape breaks when X changes its internal API | H | M | Pinned version, daily canary check; budget time for upgrades. |
| R28 | Missed or delayed posts | M | M | Daily reconciliation; `/submit` as a second intake; scraped data never used for resolution. |

#### Business and operations
| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R21 | Cold start: few traders, so prices are meaningless | H | H | Seed markets on KOLs with engaged audiences; points leaderboard; shareable receipt cards; launch crypto-only. |
| R22 | Competition (XKOL live on the same chain; KOL Predict and kolbets in the same niche) | H | M | Ship the v1 differentiators; edge score and receipt cards are the visible difference. |
| R23 | Solo bandwidth: timeline slips while also building other projects | H | M | Cut to M0–M5 for a first public beta; reuse shared packages. |
| R24 | LLM quality drift or cost growth | L | L | Log AI decisions vs human decisions; pin model version; cap tokens per draft. |

(R8 was removed along with the official X API.)

### B10a. Moderation: AI + human review

Neither "admin reviews everything" nor "AI decides everything". Route each draft:

1. **Code validators (not AI)** — deadline in the future and ≤ ~12 months out; asset and data source on allowlists; numeric threshold; not a duplicate; KOL not `excluded`. Fail → auto-reject.
2. **Two AI passes** — pass 1 extracts the market (B6 #2); pass 2 is a separate call that checks it against a checklist: real prediction? question matches the post? resolvable from the named source? neutral wording? outcome not controlled by the KOL?
3. **Routing**
   - **Auto-publish:** validators pass, both passes agree with high confidence, and the market fits an approved template (e.g. "Will BTC close ≥ $X on <exchange> (UTC) before <date>?" for allowlisted majors).
   - **Human review queue:** everything else — politics, sports, tech, company or people claims, low-cap tokens, any disagreement.
   - **Auto-reject:** clear non-predictions; a web submitter sees "rejected: not a checkable prediction" and gets an in-app notification.
4. **After publish** — "flag this market" button, admin can pause within the first hour, resolver can still settle INVALID (0.50 per share).

**Rollout:** weeks 1–4, a human reviews 100% and the AI's decision is logged beside yours. Enable auto-publish **one template at a time** once AI–human agreement is ≥ ~95% on ≥ ~100 cases (starting thresholds; adjust). Resolution follows the same pattern: the bot proposes, the dispute window + arbitrator multisig is the human backstop.

### B11. Open decisions for you
1. ~~Project name~~ — decided: **STAMPD**. No project token in v1; a $STAMPD token would be a separate, later project after legal review (V11). The ticker $STAMP is already used by other tokens.
2. Demo collateral only, or plan a path to real collateral (legal first)?
3. Envio vs a custom viem log-poller for indexing.
4. Who arbitrates disputes in v1 (you + multisig) and the proposer/disputer bond size.
5. Initial KOL list and categories (crypto-only first is simpler to resolve).
6. Auto-publish templates and the agreement threshold for switching them on (B10a).

### B12. Review checklist

#### Things to verify (unconfirmed facts in this plan)
| # | Item | Why it matters | How to check | Needed by |
|---|---|---|---|---|
| V4 | X terms on storing content and handling deleted posts | Compliance for stored posts (R4) | Read X's Terms of Service and privacy policy; ask your lawyer (V11) | M4 |
| V5 | Which multisig tooling is deployed on Robinhood Chain | Admin/arbitrator keys (R16) | Check the tool's supported networks and the chain's docs | M1 |
| V6 | Commercial-use terms of each resolution data source (exchange APIs, CoinGecko) | Legal right to use the data for settlement | Read each API's terms of service | M5 |
| V7 | Oracle or main DEX pools on Robinhood Chain | Needed before chain-token or tokenized-stock markets | Chain docs, Blockscout, DEX sites | Later |
| V8 | How XKOL creates and resolves markets (who calls `createMarket` and `propose`) | Competitive insight; shows whether they automate | Blockscout transaction lists for their MarketFactory and Resolver | Anytime |
| V9 | How KOL Predict and kolbets work | Competitive positioning (R22) | Their sites/docs when reachable | Before launch |
| V10 | STAMPD: domain (stampd.com belongs to the Stampd clothing brand — look at e.g. stampd.xyz / stampd.markets), X handle, trademark in financial-services/software classes | Branding (R5) | Registrar, X, a trademark database | Before branding |
| V11 | Legal opinion for your target markets, incl. whether demo tokens or points count as value, **and the scraping setup (R25)** | R1, R2, R25 | Lawyer | Before public launch |
| V12 | You own or may reuse the Robinchan code you plan to share | Avoids an IP dispute | Your agreement for that project | M0 |
| V13 | Envio pricing/limits for Robinhood Chain | Indexer choice (B11 #3) | Envio docs | M2 |
| V14 | twscrape current state: latest release, open breakage issues, whether `user_tweets` / `tweet_details` still work | The only ingest source (R6, R27) | GitHub repo releases and issues; run a local test | M4 |

(V1–V3 and V15 were removed along with the bot, the official X API and the fallback provider.)

#### Review gates
**Before testnet deploy**
- [ ] FPMM math reviewed against B5 formulas; buy/sell round-trip tests pass
- [ ] Fuzz + invariant tests pass; Slither has no high findings
- [ ] Roles split: creator, resolver, arbitrator, admin

**Before mainnet (demo collateral)**
- [ ] External review of contracts done and findings fixed
- [ ] Multisig + timelock live; pause tested
- [ ] Resolver dry run on ~10 already-resolved historical calls matches expected outcomes
- [ ] Moderation playbook (B10a), takedown process, Terms of Service, privacy policy and "not financial advice / demo money" disclaimers published
- [ ] Contract addresses verified on Blockscout and listed on `/contracts`
- [ ] Outage test: stop `apps/scraper` and confirm the alert fires, the banner shows, `/submit` queues, and reconciliation catches up after restart
- [ ] V4–V6, V10–V12, V14 closed

**Before real collateral**
- [ ] Legal opinion (V11)
- [ ] Full audit
- [ ] Oracle / resolution sources hardened (R10)
- [ ] Decision on geo-restrictions and identity checks, based on legal advice

#### Ongoing review cadence
- **Weekly:** scraper health (active accounts, outages, canary results); AI–human agreement per template; INVALID rate; disputes; flagged markets; faucet claims per IP/wallet.
- **Monthly:** takedown requests; Robinhood Chain changelog and twscrape releases; risk register re-rated; competitor check.

---

## Sources
- XKOL home: https://www.xkol.bet/
- XKOL contracts: https://www.xkol.bet/contracts
- XKOL insights: https://www.xkol.bet/insights
- XKOL KOLs: https://www.xkol.bet/kols
- XKOL callouts: https://www.xkol.bet/callouts
- XKOL market example: https://www.xkol.bet/markets/cmuh9l1o8001i11u6hwnlr9pv
- Robinhood Chain — connecting: https://docs.robinhood.com/chain/connecting
- Robinhood Chain — deploy contracts (Foundry): https://docs.robinhood.com/chain/deploy-smart-contracts
- Envio — Robinhood Chain (Chain ID 4663): https://envio.dev/chains/robinhood
- Blockscout explorer: https://robinhoodchain.blockscout.com/
- X API pricing (official, for the cost comparison): https://docs.x.com/x-api/getting-started/pricing
- KOL Predict: https://kolpredict.bet/
- kolbets on X: https://x.com/kolbets
- twscrape: https://github.com/vladkens/twscrape
- X v. Bright Data, partial revival (Bloomberg Law): https://news.bloomberglaw.com/litigation/x-partially-revives-lawsuit-against-israeli-data-scraping-firm
- X v. Bright Data, May 2024 dismissal (Morrison Foerster): https://www.mofo.com/resources/insights/240604-california-federal-court-holds-x-s-claims
