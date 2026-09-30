# Decisions

Choices made while building, with the reason. Section references point to `xkol-analysis-and-web3-plan.md` (B*, R*, V*) and `development-plan.md` (numbered steps).

## Pre-work checks (development plan 0.6)

| Check | Status | Notes |
|---|---|---|
| V12 — may we reuse Robinchan code? | **Open** | Nothing from Robinchan was copied; the monorepo was written from scratch, so this only matters if shared packages are brought in later. |
| V14 — does twscrape work today? | **Done 30 Sep 2026** | twscrape 0.20.1 (pinned) with two dedicated cookie-based accounts: `user_by_login` and `user_tweets` return live data through each account and through the STAMPD service (`/health`, `/user`, `/timeline`). The live run showed that timelines repeat entries and include other accounts' posts from conversations; both the scraper and the worker now keep only the KOL's own posts, once each (plan R3). |

## D1 — One `MarketHub` holds every pool, reserves as numbers

Pool reserves are storage values; outcome tokens exist only in traders' wallets. For every market `YES supply = collateral − yesReserve` (and the same for NO). This is checked by the invariant suite and by the indexer's hourly reconciliation. It keeps the hub from being an ERC-1155 receiver and makes solvency a one-line invariant.

## D2 — Faucet mints only against a backend-signed voucher

Plan 1.1. Without the voucher anyone could skip the captcha by calling the contract. The voucher binds the address, amount, the address's claim nonce and a deadline (EIP-712), and the contract still enforces one claim per 24 h. `DemoUSD` also refuses transfers that don't involve a protocol contract (plan R2), so the token can't trade or be passed around.

## D3 — Allowlist misses go to human review, not auto-reject

Plan B10a says validator failures auto-reject, but also routes "politics, sports, tech, company or people claims" to the review queue. Both can't hold if "asset and data source on allowlists" is a hard validator. So validators are split:

- **Hard** (auto-reject): not a prediction, no/invalid deadline, deadline past or < 24 h away, > 365 days away, duplicate, KOL excluded.
- **Soft** (review): source or asset not allowlisted, non-numeric threshold, outcome controlled by the KOL (R11).

## D4 — Claims with no deadline are rejected

Plan B6 #2 leaves "default horizon or rejection" open. v1 rejects (`DEADLINE_MISSING`); inventing a deadline would put words in the KOL's mouth.

## D5 — "Before <date>" means any daily close in the window

Market specs carry `resolution.mode`: `any-close-before` (default: YES if any UTC daily close from the market's opening day to the deadline day meets the condition) or `close-on` (only the deadline day's close). The resolver refuses to resolve if any day in the window is missing from the source. The window starts at market open, not at the post, so a market can't be settled by a price reached before anyone could trade it.

## D6 — Edge TWAP starts at the first trade

Plan B2 #2: `p` must not reflect our seeded odds. The 24 h window runs from market open, but averaging starts at the first trade. Markets with no trade in the window store `kolSideTwap24hBps = -1` and never count. Hit rate excludes INVALID in the denominator (shown separately), matching how edge treats it.

## D7 — Notifications over SSE, not Supabase Realtime

Development plan 6.3 (already recorded there): SIWE sessions aren't Supabase Auth sessions. The API streams "something new" per wallet over Server-Sent Events fed by Redis pub/sub; the web refetches, and polls every 30 s as a fallback.

## D8 — The indexer stores raw events and projects from them

`ChainEvent` holds every decoded event; markets, trades, positions, prices and resolutions are projections. A reorg deletes events after the fork and replays the touched markets; `indexer:backfill` replays everything. Tested against anvil (development plan 2.1: backfill rebuilds identical rows; a reverted block is detected and rewound). Pool reserves are recomputed with the same FPMM math and compared to each `Trade` event; a mismatch raises `indexer.reserve-drift`.

## D9 — Prisma 7 with the pg driver adapter; PGlite for tests

Prisma 7 needs a driver adapter. Tests (and `pnpm dev:local`) run real Postgres in-process via PGlite over the wire protocol, with the committed migration applied, so no Docker is needed. PGlite serves one connection at a time, hence `DATABASE_POOL_MAX=1` locally.

## D10 — React Bits components, adapted

The approved components were pulled from the React Bits registry (TS + Tailwind) into `packages/ui/src/bits/` and restyled per development plan 1.8. Beyond restyling:

- **FadeContent** was ported from gsap/ScrollTrigger to motion, so the app ships one animation library.
- **SplitFlapText** is value-driven (flips once when the price changes) instead of cycling a word list.
- **AnimatedList** lost its window-level Tab/arrow-key handler, which broke keyboard navigation for the whole page.
- **BellToggle** keeps the ring and badge but not the labelled toggle, since the bell opens a dropdown.
- **Noise** draws one tile once instead of a full-screen canvas every other frame.
- **Topography** was not added: it's optional in the plan and the home page reads fine without it.

The `check:bits` guard described here was relaxed by D14.

## D11 — Versions

Next.js 16 / React 19 / Tailwind 4, wagmi **2** (RainbowKit 2 doesn't support wagmi 3 yet), TypeScript **5.9** (not 7, for tooling compatibility), Prisma **7.10** (8 is still a release candidate), BullMQ 5 + ioredis 5, twscrape **0.20.1** pinned. AI provider: see D13 (the plan named Claude Haiku 4.5).

## D12 — `MarketFactory` records the market id before external calls

Slither flagged `marketByQuestion` being written after the seed transfer and `hub.openMarket`. The factory now predicts the id (`hub.marketCount() + 1` — the factory is the hub's only market creator), writes it first, asserts `openMarket` returned the same id, and is `nonReentrant`.

## D13 — DeepSeek is the only AI provider

Decided 30 Sep 2026, replacing plan B4's Claude Haiku 4.5, with no fallback provider. `packages/ai` calls DeepSeek's OpenAI-compatible API through the official `openai` SDK (`https://api.deepseek.com`, model `deepseek-flash` by default, `AI_MODEL` to change).

- **JSON mode, not schema enforcement.** DeepSeek guarantees valid JSON, not our fields, and needs the word "json" plus an example in the prompt. The field list in both prompts is generated from the Zod schemas that validate the answers, every answer is validated, and a bad or empty answer (DeepSeek documents occasional empty replies) is retried once. After two failures the draft goes to a human.
- **Thinking mode off by default** (`AI_THINKING`). On the live check it gave the same decisions at ~2.3× the cost and 2–4× the latency.
- **Cost logging** uses DeepSeek's cache-hit/cache-miss token split and its peak/off-peak pricing (peak 01–04 and 06–10 UTC on weekdays). Chinese public holidays are not modelled.
- **Live check** (`pnpm --filter @stampd/ai live-check`): 6 of 6 posts with known answers handled correctly — dated calls (bullish and bearish), hype, a target with no date, a prompt-injection post, and a self-controlled outcome — for about $0.0014 per run. The first run found that the check pass wasn't given the current date (it judged 2026 deadlines against its training data), misread the side convention on bearish calls, and that "above" should map to `>` not `>=`; all three were fixed in the prompts.
- **For the legal review (V11):** only public X post text is sent; DeepSeek processes it on servers in China.

## D14 — "Neon Receipt" visual direction replaces the paper theme

Decided 30 Sep 2026 by the project owner, overriding the plan's visual rules in §1.2 and §1.8 (a paper-and-ink theme, light by default, with no gradients, glows or shadows). Those rules produced a UI the owner judged too plain for a web3 product. What changed:

- **Dark by default.** The palette is near-black with a neon lime brand (`#c8ff2e`) plus violet and cyan accents. Light remains an explicit choice from the header toggle (`data-theme="light"`). Body text still meets WCAG AA in both themes.
- **Icons:** lucide-react only, never text glyphs (▲ ▼ ↗ → ✦) or emoji. The decorative pieces that remain are animated shapes, not icons: the progress ring, the ticket outlines and the logo stamp.
- **Type:** Unbounded for display headings, Manrope for UI text and market questions, JetBrains Mono for figures.
- **Allowed now:** gradients, glows, glass cards and animated React Bits. Added bits: LightRays (ogl), RotatingText, BlurText, ShinyText, GradientText, DecryptedText, CountUp, SpotlightCard, ElectricBorder, StarBorder, GlareHover, ClickSpark, LogoLoop and Magnet. Anything that needs three.js or gsap was left out.
- **What didn't change:** the receipt remains the product's signature (dashed rules, stamps, the tx hash). Prices always render as plain text under `prefers-reduced-motion`, which also turns off WebGL, the electric border and the flashes. There is still no horizontal scroll at 390 px.
- **`check:bits` now bans** three.js, gsap and Hugeicons imports, and any hardcoded hex colour in `src/bits`. A canvas or WebGL bit that has to take a raw colour (ClickSpark, ElectricBorder, GlareHover's glare, LightRays) opts out with a `check-bits: raw-colours` comment that says why.

## D15 — Hosting: Railway + Vercel, Railway Postgres and Redis

Decided 30 Sep 2026 by the project owner, replacing the plan's Supabase / Upstash / Fly.io set-up. The api, worker and
scraper run on Railway as Docker services; Postgres and Redis are Railway's own, on the same private network. The web
app runs on Vercel.

- **Railway Postgres** has no connection pooler, so one `DATABASE_URL` serves the app and `prisma migrate`
  (`DIRECT_URL` stays optional). Pools are sized with `DATABASE_POOL_MAX` (10 each for api and worker, well under
  Postgres's 100 connections).
- **Railway Redis instead of Upstash**: BullMQ polls continuously, and Upstash bills per command.
- **IPv6 private network**: the api and scraper listen on `::`; ioredis connections use `family: 0`.
- **Contract deploys** go through `pnpm --filter @stampd/contracts deploy:chain`, which simulates by default and
  records addresses only on a real broadcast.
- `apps/scraper/fly.toml` was removed. Railway has deprecated `railway.json` config-as-code, so the service settings live on the services themselves and are listed in the runbook.

## D16 — AI judgement publishes markets without manual review (for now)

Decided 1 Oct 2026 by the project owner, overriding the plan's rollout gate for auto-publish templates (B10a: switch a
template on only at ≥ 95% AI–human agreement on ≥ 100 reviewed cases). The owner wants markets to flow without a
human in the loop during the testnet phase.

- The gate stays visible in Admin → templates, but the owner can **turn a template on early** after a confirmation.
  The switch is audited like any other admin change and can be turned off at any time.
- What auto-publishes is unchanged: only drafts that pass every hard validator, get an "approve" from both AI passes
  with confidence ≥ 0.9, and fit an enabled template (today only `crypto-major-daily-close`, which the resolver bot can
  settle on its own). Everything that fails a validator is still auto-rejected.
- Drafts that don't fit a template stay in the review queue unpublished; nobody has to act on them.
- Revisit before mainnet: measure agreement on a sample of published markets and keep the gate for new templates.
