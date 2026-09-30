# STAMPD — Development Plan

> Companion to `xkol-analysis-and-web3-plan.md` (the "plan file"). This document turns that plan into **ordered build steps**, plus the **design system** the UI is built with.
> Written 30 Sep 2026. Section references like **B5** or **R25** point to the plan file.

---

## 0. Scope

**v1 builds exactly this** (plan file B2):
- Core: KOL post → AI draft → moderation → onchain YES/NO market → trade → resolve → redeem.
- Differentiator 1: **Paste-a-link submission** (`/submit`).
- Differentiator 2: **Edge score** on KOL pages.
- Differentiator 3: **Receipt cards + in-app notifications**.

**Not in v1:** bot mention/reply, official X API, fallback data provider, claim-your-profile, Telegram, fee withdrawal, liquidity withdrawal, creator fee share, tokenized-stock markets, external LPs.

> Decision recorded: no fee or liquidity withdrawal in v1. The contracts are not upgradeable, so adding either later means deploying new contracts and moving markets over.

**Stack** (plan file B4): pnpm + Turborepo · Next.js App Router (a version on React 19, i.e. 15 or newer) + TypeScript + Tailwind v4 · **React Bits** components + `motion` / `gsap` / `ogl` for animation (1.8) · wagmi + viem + RainbowKit + SIWE · Fastify · Supabase Postgres + Prisma · Upstash Redis + BullMQ · Foundry + OpenZeppelin v5 · Python FastAPI + twscrape · Claude Haiku 4.5 · Vercel + Fly.io/Railway.

---

## 1. Design System — "Receipt"

### 1.1 What current products look like (research, 30 Sep 2026)

| Reference | What they do | What we take |
|---|---|---|
| **Robinhood** (2024 identity, by Porto Rocha) | Black, white and mature neutrals with one electric accent ("Robin Neon"); a serif (Martina Plantijn) for headlines next to a custom sans; illustration style based on financial graphs; "less is more" | Neutral base + **one** accent; serif headlines; graph-based visuals instead of 3D art. Our chain's owner sets the ecosystem tone. |
| **Kalshi** (brand kit) | White `#FFFFFF` + light grey `#F5F7F4` backgrounds, near-black `#050D0A` text, one green in two versions: `#00B67A` for light backgrounds, `#00DD94` for dark; condensed type for dense tables | A **separate accent value per theme**, tuned for contrast; condensed/mono type for data. |
| **Polymarket** (redesign, Mar 2026) | Dark default (`#0C0E13`), dense grid; homepage moved from a market list to a **news-style front page**: headline events, a "breaking" column of big probability moves, charts as the focal point | Treat **price moves as headlines**. Lead with the biggest move and its chart. |
| **Limitless**, **Hyperliquid** | Trader density; Hyperliquid pairs a light page with a deep teal-black `#03211C` | Density is fine if hierarchy is strict; near-black with a hue reads more considered than `#000`. |
| **XKOL** (competitor) | Light theme, emerald `#059669`, Inter/Geist, terminal-prompt accents | **Avoid**: emerald, Inter/Geist, terminal gimmicks — we must not look like them. |

**Direction:** the product's promise is *"every call gets a receipt."* So the UI borrows from **printed financial paper** — a newspaper markets page and a till receipt: warm paper background, black ink, a serif for questions, monospaced figures, thin rules instead of shadows, and a **highlighter mark** as the only accent.

### 1.2 Rules against generic "AI-made" design

Do **not** ship any of these:
- Purple/indigo/cyan gradients, gradient text, glowing orbs, particles, animated mesh backgrounds. This rules out most of React Bits' backgrounds; 1.8 lists the few that fit.
- Glassmorphism (blurred translucent panels), drop shadows on every card, 16px+ rounded corners everywhere.
- A hero with a vague slogan + two buttons + a 3-column grid of icon feature cards.
- Emoji as icons or bullets (receipt cards use typographic stamps, not ✅/❌).
- Stock 3D illustrations, AI-generated imagery, fake avatars.
- Counters that animate from 0, fake "live" numbers, placeholder statistics. **Every number shown is real data or a clearly labelled empty state.**
- Inter / Geist / Space Grotesk as the brand face (overused; Inter/Geist is also XKOL's).

Do:
- One accent, used rarely. Hierarchy from **type size, weight and rules**, not color.
- Real content in every mock: real market questions, real prices, real dates.
- Tabular numerals for every number. Align numbers right in tables.

### 1.3 Color tokens

Contrast measured against WCAG 2.x (script run 30 Sep 2026). Body text ≥ 4.5:1, input borders ≥ 3:1.

**Light (default)**

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--paper` | `#F6F4EE` | Page background (warm off-white) | — |
| `--surface` | `#FFFFFF` | Cards, trade panel, tables | — |
| `--ink` | `#16140F` | Primary text, headlines | 16.7 on paper |
| `--ink-2` | `#4A463D` | Secondary text | 8.5 on paper |
| `--ink-3` | `#6B665A` | Meta text (dates, handles) | 5.2 on paper |
| `--rule` | `#D9D4C7` | Dividers (decorative) | — |
| `--rule-strong` | `#8A8475` | Input borders, focusable outlines | 3.4 on paper |
| `--yes` | `#0B7449` | YES price, gains | 5.3 on paper |
| `--yes-bg` | `#DDF0E5` | YES button / chip fill | yes text 4.9 |
| `--no` | `#B3262E` | NO price, losses | 5.9 on paper |
| `--no-bg` | `#F6E1DF` | NO button / chip fill | no text 5.2 |
| `--mark` | `#FFD23F` | Highlighter: behind ink text only (biggest mover, "your position", resolved stamp) | ink on mark 12.7 |
| `--focus` | `#1F4FD8` | Focus ring, text links on hover | 6.0 on paper |

**Dark**

| Token | Hex | Contrast |
|---|---|---|
| `--paper` | `#12110F` | — |
| `--surface` | `#1B1A17` | — |
| `--ink` | `#F2EFE6` | 16.4 on paper |
| `--ink-2` | `#BDB7A9` | 9.4 |
| `--ink-3` | `#8F897C` | 5.4 |
| `--rule` | `#2F2D28` | — |
| `--rule-strong` | `#6E695E` | 3.5 |
| `--yes` / `--yes-bg` | `#3DCB87` / `#16301F` | 9.1 / 6.8 |
| `--no` / `--no-bg` | `#FF7A73` / `#3A1C1A` | 7.4 / 6.1 |
| `--mark` | `#FFD23F` (text on it stays `#16140F`) | 12.7 |
| `--focus` | `#7FA2FF` | 7.7 |

Rules:
- YES/NO always carry the **word** ("YES 56¢"), never color alone (color-blind users).
- `--mark` is never a text color and never a large fill; it's a highlighter stroke behind a few words.
- Light theme is default (editorial feel, like a printed page); dark theme follows `prefers-color-scheme` with a manual toggle.

### 1.4 Typography

All three families are free (SIL Open Font License) on Google Fonts; self-host with `next/font`.

| Role | Font | Settings |
|---|---|---|
| Market questions, page headlines | **Newsreader** (serif) | 500–600 weight, tight leading (1.15), optical size on |
| UI text, labels, buttons | **IBM Plex Sans** | 400 / 500 / 600 |
| Prices, percentages, volumes, dates, addresses, tx hashes | **IBM Plex Mono** | `font-variant-numeric: tabular-nums` |

Scale (rem, 16px base): 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3. Market question on a card = 1.125 serif; on the market page = 2.25 serif.

### 1.5 Layout, shape and motion
- **Grid:** 12 columns, max width 1280px, 24px gutters desktop, 16px side gutter on phones.
- **Shape:** 4px radius on controls, 6px on cards. No shadows; 1px `--rule` borders. Dashed rules (`1px dashed --rule-strong`) only on receipt-style blocks.
- **Density:** market list is a **table** on desktop (question · YES · NO · 24h change · volume · closes), cards on mobile.
- **Motion:** price change = 600ms background flash of `--yes-bg`/`--no-bg` on the changed number, plus the few React Bits pieces in 1.8. Everything else is still. Respect `prefers-reduced-motion` everywhere (no flash, no animation).
- **Icons:** Lucide, 1.5px stroke, 16/20px, only where a label alone isn't enough.
- **Charts:** Recharts line charts, 1.5px stroke in `--ink`, YES area not filled, crosshair tooltip in mono; no gradients under lines.

### 1.6 Signature components
1. **Headline move** (home top): the day's biggest price move — serif question at 2.25rem, the move highlighted with `--mark` ("56¢ → 71¢", the new price drawn with React Bits **SplitFlapText**), a full-width chart, the KOL's quoted post underneath.
2. **Market row / card:** KOL handle + avatar (24px) · serif question · YES/NO prices in mono chips · 24h change · volume · close date.
3. **Trade panel:** YES/NO segmented control, amount input with demo-USD balance, live quote block in mono (shares, avg price, price impact, fee), one primary button.
4. **Receipt block** (market page after resolution + share image): dashed top/bottom rules, mono lines like a till receipt. Example with placeholder values:
   ```
   ------------------------------------------
   CALL        @example_kol · 12 Mar 2026
   QUESTION    BTC daily close ≥ $90,000
               before 31 Mar 2027?
   RESULT      YES            [CALLED IT]
   FINAL       100¢  · opened 50¢
   SETTLED     tx 0x4b1e…9a0c · block 72,104,388
   ------------------------------------------
   ```
   The stamp `CALLED IT` / `MISSED` / `VOID` sits on a `--mark` highlight, rotated −2°. On the market page the receipt is a React Bits **TearTicket**: tearing off the stub opens the share options (1.8).
5. **Edge score badge:** `+0.12 edge · 18 calls` in mono; tooltip explains the formula in one sentence.
6. **Notification bell:** React Bits **BellToggle** with the unread count; dropdown list of the latest 10 using **AnimatedList** (1.8).

### 1.7 Page layouts (desktop; mobile stacks top-to-bottom)
- **`/`** — Headline move (8 cols) + "Moves today" column (4 cols) → market table with category tabs → "Just resolved" receipts row → KOL list by activity.
- **`/markets/[id]`** — Left 8 cols: question, KOL post quote, chart, rules + data source, activity. Right 4 cols: sticky trade panel, your position, share receipt.
- **`/kol/[handle]`** — Header (avatar, handle, hit rate with n, edge with n) → live calls table → resolved calls as receipts.
- **`/submit`** — Single input for a tweet URL, draft preview, your submissions table with status.
- **`/portfolio`**, **`/notifications`**, **`/faucet`**, **`/contracts`**, **`/insights`**, **`/takedown`**, **`/admin`** — table-first, same tokens.

### 1.8 Components and motion with React Bits

[React Bits](https://reactbits.dev) is a free library of animated React components (text animations, animations, components, backgrounds, micro-interactions). Each comes in JS/TS × CSS/Tailwind variants and is **copied into your repo**, so you own and restyle the code. Checked against the GitHub repo on 30 Sep 2026.

**How we use it**
- **Install** the TypeScript + Tailwind variant with the shadcn CLI, e.g. `npx shadcn@latest add @react-bits/SplitFlapText-TS-TW`. Put the files in `packages/ui/src/bits/<Name>/`.
- **Versions:** the library is built on React 19 and Tailwind v4, so the web app uses both.
- **Dependencies** added only as needed: `motion`, `gsap` (+ `@gsap/react`), `ogl`. **Not** `three` / `@react-three/*` (too heavy for what we need).
- **Restyle every component** before use: replace hardcoded colors with our tokens (1.3), fonts with Plex Mono / Plex Sans / Newsreader (1.4), remove glows and drop shadows, radius ≤ 6px. Components from the *Micro* set import Hugeicons; swap those for Lucide so there's one icon set.
- **License:** MIT + Commons Clause — free to use in STAMPD, including commercially. You may **not** sell or redistribute the components themselves (so never publish `packages/ui` as a standalone package).

**Approved components**

| Component (category) | Where in STAMPD | Settings / changes |
|---|---|---|
| **SplitFlapText** (Text) | Headline move: the new price flips in like a departure board | `charset="numeric"`, `loop={false}`, one word = the new price digits (the `¢` sign rendered outside, since it isn't in the charset); tile color `--surface`, text `--ink`, radius 4; the final value also goes into an `aria-live` text. Has reduced-motion support built in. |
| **Counter** (Components) | Live YES/NO prices in the trade panel and market rows: digits roll from the **old** value to the **new** one | Never starts from 0. Wrap with `useReducedMotion` → plain text when reduced motion is on (the component doesn't handle it itself). |
| **TearTicket** (Micro) | The receipt block on a resolved market; tearing the stub opens Share (copy link / native share) | Perforation via `holes`; `tilt={false}`; `radius={6}`; always keep a normal **Share** button next to it for keyboard and screen-reader users. Reduced-motion aware. |
| **StatusMark** (Micro) | Submission status on `/submit` and in the admin queue (pending → in review → approved / rejected) | `doneColor` = `--yes`, `errorColor` = `--no`; label text always shown. Reduced-motion aware. |
| **HoldButton** (Micro) | "Hold to dispute" when posting a dispute bond — an action that costs money and shouldn't happen by accident | Remove the glow shadow; fill `--no`. **Not** used for normal trades (it would slow trading down). Reduced-motion aware. |
| **BellToggle** (Micro) | Notification bell with unread badge; rings once when a new notification arrives | Badge in `--ink` on `--mark`; Lucide `Bell` instead of Hugeicons; `waves={false}`. Reduced-motion aware. |
| **AnimatedList** (Components) | Notification dropdown and the market Activity tab: new rows slide in | Wrap with `useReducedMotion`. |
| **SwipeToast** (Micro) | Transaction toasts: submitted → confirmed / failed, with the tx hash in mono | Lucide icons; colors from tokens. Reduced-motion aware. |
| **FadeContent** (Animations) | "Just resolved" receipts row on `/` fading up once when scrolled into view | 12px rise, 400ms, runs once; off under reduced motion. |
| **Noise** (Animations) | Faint paper grain over `--paper` (the "printed paper" feel) | `patternAlpha` ≈ 8–10; change the component to **draw once** instead of redrawing every 2 frames (a static texture costs nothing); `pointer-events: none`; `aria-hidden`. |
| **Topography** (Backgrounds) | Optional, **only** behind the home masthead: faint contour lines, echoing the financial-graph illustration style | Colors from `--rule` / `--rule-strong` (not the purple/pink defaults); `speed` ≈ 0.05, `glow={0}`; desktop ≥ 1024px only, lazy-loaded with `next/dynamic` (`ssr: false`), paused when offscreen or the tab is hidden, static under reduced motion. Drop it if the page feels busy. |

**Not allowed** (they break 1.2 or copy XKOL's look): Aurora, Particles, Galaxy, Hyperspeed, Silk, Iridescence, Plasma, Prism, LightRays, Beams, Orb, LiquidEther, Ballpit, Dither and every other colorful background · GradientText, ShinyText, GlitchText, DecryptedText, ASCIIText, FaultyTerminal, LetterGlitch (terminal/hacker look) · CountUp from zero · all cursor effects (BlobCursor, SplashCursor, GhostCursor, TargetCursor, ClickSpark…) · GlassSurface, FluidGlass, GlassIcons, ElectricBorder, StarBorder, SpotlightCard, TiltedCard, MagicBento, Dock.

**Motion budget**
- At most **one** ambient effect per page (Noise counts; Topography only on `/`).
- Nothing loops forever except the paper grain (which is static after the change above).
- Every animation ≤ 600ms, except SplitFlapText (≈ 1s, once per update).
- WebGL components lazy-loaded and paused offscreen; each route stays within +30 KB gzipped for animation code, checked in CI with a bundle report.
- Every animated element works the same with `prefers-reduced-motion: reduce` — just without the movement.

---

## 2. Repository layout

```
stampd/
├─ apps/
│  ├─ web/          Next.js App Router (pages in 1.7, route handlers only for SIWE)
│  ├─ api/          Fastify: REST for web, admin, SSE notifications
│  ├─ worker/       BullMQ workers: ingest, ai, market-create, indexer, resolver, stats, notify
│  └─ scraper/      Python 3.11 + FastAPI + twscrape (single instance, persistent volume)
├─ packages/
│  ├─ contracts/    Foundry: src/, test/, script/
│  ├─ chain/        viem chain defs (4663, 46630), ABIs, typed clients, deployments/*.json
│  ├─ db/           Prisma schema + migrations
│  ├─ core/         FPMM quote math in TypeScript (must match Solidity exactly), edge-score math
│  ├─ ai/           Prompts, JSON schemas, validators, Haiku client
│  └─ ui/           Design tokens (CSS variables), components from 1.6,
│                   src/bits/ = restyled React Bits components (1.8)
└─ docs/            ADRs, runbook, moderation playbook
```

Conventions: TypeScript strict; Zod on every API input; money as `bigint` on the wire and `NUMERIC` in Postgres (never JS `number`); every job idempotent by a natural key; conventional commits; `pnpm verify` (lint + typecheck + tests + `forge test` + Slither) must pass before merge.

---

## 3. Step-by-step build

Each step lists **what to build** and **done when** (the check that proves it). Do the steps in order; a phase isn't finished until every "done when" passes.

### Phase 0 — Setup (M0, 3–4 days)

**0.1 Monorepo.** pnpm workspace + Turborepo; the folders from §2; shared `tsconfig`, ESLint, Prettier; `.env.example`.
*Done when:* `pnpm i && pnpm verify` passes on a clean clone.

**0.2 Chain config.** `packages/chain`: viem `defineChain` for Robinhood Chain mainnet (4663) and testnet (46630), RPC from env, Blockscout URLs.
*Done when:* a script prints the latest block number from both networks.

**0.3 Database.** Supabase project; Prisma schema with every table from plan file B7; first migration.
*Done when:* `prisma migrate deploy` succeeds against Supabase and a seed inserts one KOL.

**0.4 Queues.** Upstash Redis + BullMQ skeleton in `apps/worker` with one no-op job and a dashboard (Bull Board) behind admin auth.
*Done when:* a test job enqueues, runs and is visible in the dashboard.

**0.5 CI.** GitHub Actions: install, `pnpm verify`, `forge test`, Slither.
*Done when:* a pull request shows all checks green.

**0.6 Pre-work checks** from plan file B12: V12 (you may reuse Robinchan code), V14 (twscrape works today — run `user_tweets` locally on one public account).
*Done when:* both recorded in `docs/decisions.md`.

### Phase 1 — Smart contracts (M1, 2–3 weeks)

**1.1 `DemoUSD`** (ERC-20, 6 decimals). Faucet claim takes a **signed voucher** from the backend (`claim(amount, deadline, signature)`, signer = `FAUCET_SIGNER` role) plus an onchain per-address 24h limit.
*Why the voucher:* without it anyone could call `mint` directly and skip the captcha (plan file R12).
*Done when:* tests cover valid voucher, expired voucher, reused voucher, wrong signer, over-limit claim.

**1.2 `OutcomeTokens`** (ERC-1155). `id = (marketId << 1) | outcome` (0 = NO, 1 = YES); `mint`/`burn` only by `MarketHub`.
*Done when:* tests show no other address can mint or burn.

**1.3 `MarketHub`** — FPMM per plan file B5:
- `createMarket` (called by the factory), `quoteBuy`, `quoteSell`, `buy(marketId, outcome, amountIn, minOut, deadline)`, `sell(marketId, outcome, amountOut, maxIn, deadline)`, `redeem(marketId)`.
- `maxFeeBps` immutable; trading blocked after `closeTime`; `nonReentrant`, `whenNotPaused`, per-market pause.
- Payouts: winner 1.00, loser 0, INVALID 0.50 per share.
- Rounding always against the trader (`out` rounded down, `in` rounded up).
*Done when:* unit tests for every function; the worked example from B5 (y = n = 100, buy 10 → 19.09 YES) passes exactly.

**1.4 `MarketFactory`.** `createMarket(questionHash, sourcePostId, closeTime, resolveBy, feeBps, seedAmount, initialYesPriceBps)`, `CREATOR_ROLE` only; pulls seed collateral; seeds uneven reserves for the opening odds; emits `MarketCreated`.
*Done when:* markets open at 50¢ and at 60¢ show exactly those prices from `quoteBuy` of 0.

**1.5 `Resolver`.** `propose(marketId, outcome, evidenceURI)` by `RESOLVER_ROLE` with a demo-USD bond → `dispute(marketId)` by **anyone** with a matching bond within `disputeWindowSec` (21,600) → `arbitrate(marketId, outcome)` by `ARBITER_ROLE` (multisig) → `finalize(marketId)` after the window. The losing side's bond goes to the winner.
*Done when:* tests cover undisputed finalize, dispute upheld, dispute rejected, finalize too early, double propose.

**1.6 Fuzz and invariant tests.**
- `y · n` never decreases after a trade.
- Collateral held ≥ what all holders can redeem in the worst case.
- YES supply and NO supply per market stay consistent with pool reserves.
- `sell(buy(x)) ≤ x` (no free money round trip).
*Done when:* `forge test` with 10,000 fuzz runs is green and Slither has no high findings.

**1.7 TypeScript quote math** in `packages/core`, mirroring `quoteBuy`/`quoteSell`.
*Done when:* a test compares TS and Solidity results for 1,000 random inputs and every result is identical to the unit.

**1.8 Testnet deploy.** Foundry script to 46630; verify on Blockscout (`--verifier blockscout`); write `deployments/46630.json` (addresses, block, commit).
*Done when:* all contracts verified; one real buy tx visible on the explorer.

### Phase 2 — Indexer + API (M2, 1–1.5 weeks)

**2.1 Indexer** (worker job, viem `getLogs`): persisted cursor, waits N confirmations, handles reorgs by rewinding the cursor, unique key `(txHash, logIndex)`.
*Done when:* wiping the tables and running `indexer:backfill --from <deployBlock>` rebuilds identical rows.

**2.2 Read model.** `markets`, `trades`, `positions`, `resolutions`, price snapshots every trade + every 5 minutes.
*Done when:* positions for a test wallet match onchain ERC-1155 balances.

**2.3 Reconciliation job** (hourly): onchain totals vs DB totals; mismatch → admin alert + email.
*Done when:* manually deleting a trade row triggers the alert.

**2.4 Fastify API.** Zod-validated routes for markets, market detail, trades, prices, KOLs, portfolio, search; SIWE session verification; rate limits; admin routes behind a wallet allowlist.
*Done when:* OpenAPI spec generated; contract tests pass for every route.

**2.5 KOL stats job.** Hit rate (with n) and INVALID count per KOL, recomputed after each resolution.
*Done when:* stats match a hand count on seeded data.

### Phase 3 — Design system + web MVP (M3, 2–3 weeks)

**3.1 Tokens + fonts.** CSS variables from 1.3 in `packages/ui`, Tailwind theme reading them, `next/font` for Newsreader / IBM Plex Sans / IBM Plex Mono, dark theme + toggle.
*Done when:* a `/styleguide` page shows every token, type size and component in both themes.

**3.2 Components** from 1.6: market row/card, price chip, trade panel, chart, receipt block, edge badge, table, tabs, empty states.
*Done when:* each renders in the styleguide with real seeded data; keyboard focus visible on every control.

**3.2b React Bits setup** (1.8). Install the approved components as TS + Tailwind variants into `packages/ui/src/bits/`; add `motion`, `gsap` and `ogl`; restyle each with tokens and fonts; swap Hugeicons for Lucide; add a shared `useReducedMotion` wrapper for Counter, AnimatedList, FadeContent, Noise and Topography; change Noise to draw once; add a bundle-size report to CI.
*Done when:* the styleguide shows every approved component in both themes and with reduced motion on; no hardcoded colors left in `src/bits/` (grep for `#` hex values returns only tokens); the bundle report shows ≤ +30 KB gzipped of animation code per route.

**3.2c Wire the motion pieces into pages:** SplitFlapText on the headline move, Counter on live prices, FadeContent on "Just resolved", Noise paper grain on the page background, SwipeToast for transaction status. Topography behind the home masthead only if it passes the 3.6 review.
*Done when:* a price update on testnet rolls the Counter from the old to the new value, and the same page with reduced motion shows the new value instantly.

**3.3 Wallet + SIWE.** RainbowKit with Robinhood Chain; SIWE sign-in; network switch prompt.
*Done when:* sign in, refresh, still signed in; wrong network shows the switch prompt.

**3.4 Pages:** `/`, `/markets`, `/markets/[id]`, `/kols`, `/kol/[handle]`, `/portfolio`, `/faucet` (Cloudflare Turnstile → API issues voucher and sets `users.captcha_verified_at` → user claims), `/contracts` (addresses + live `eth_getCode` check in the browser).
*Done when:* a new wallet can claim demo USD, buy YES, see the position, and sell back, all on testnet.

**3.5 Quote accuracy test.** Playwright: the trade panel's quote equals `quoteBuy` from the contract.
*Done when:* 5 random amounts match exactly.

**3.6 Design review** against 1.2 and the motion budget in 1.8.
*Done when:* none of the banned patterns or banned React Bits components appear; at most one ambient effect per page; Lighthouse accessibility ≥ 95 and performance ≥ 90 on `/` and `/markets/[id]` (mobile profile).

### Phase 4 — Ingest, AI, moderation, `/submit` (M4, 2–2.5 weeks)

**4.1 Scraper service** (`apps/scraper`, plan file B6b): FastAPI with `/timeline/{user_id}?after_id=`, `/post/{id}`, `/user/{handle}`, `/health`; twscrape pinned; `accounts.db` on a persistent volume; dedicated accounts only; single instance.
*Done when:* `/timeline` returns only posts newer than `after_id` for 3 test KOLs.

**4.2 Ingest jobs.** Per-KOL schedule (busy KOLs more often), spread out; stop at the first known post ID; daily reconciliation fetch; health guard pauses jobs and emails you on failure; kill switch env var stops all scraping.
*Done when:* stopping the scraper pauses ingest, shows the "new markets paused" banner, and resumes cleanly with no duplicates.

**4.3 Pre-filter.** Skip replies, reposts and posts without forward-looking words, numbers or dates.
*Done when:* on a labelled sample of 200 posts, it drops ≥ 60% while keeping every real prediction in the sample.

**4.4 AI pass 1 — extract** (Claude Haiku 4.5, `claude-haiku-4-5-20251001`): strict JSON (`is_prediction, subject, metric, comparator, threshold, deadline_utc, resolution_source, question, rules, category, kol_side, confidence`); post text treated as data only; every call logged with tokens and cost.
*Done when:* output validates against the Zod schema 100% of the time on the sample (retry once on invalid JSON).

**4.5 Code validators + AI pass 2 — check** (plan file B10a): deadline in future and ≤ 12 months; allowlisted asset and source; numeric threshold; not duplicate; KOL not excluded; then a separate AI call with the checklist.
*Done when:* each validator has a failing and passing test case.

**4.6 Routing + admin review queue.** Auto-publish (off at launch), review, auto-reject. Admin screen: post, draft, both AI outputs, edit fields, approve/reject with a reason. Every decision logged next to the AI's decision.
*Done when:* approving a draft creates the market onchain (creator key signs via the worker) and it appears on the site within one indexer cycle.

**4.7 `/submit`.** Parse post ID, 5 per wallet per day, dedupe against existing markets, fetch via scraper (queue if down), run 4.3–4.6 with `source = web`, status list for the submitter.
Each status uses React Bits **StatusMark** with its text label.
*Done when:* a pasted link goes queued → in review → approved and credits the submitter on the market page.

### Phase 5 — Resolution (M5, 1 week)

**5.1 Data source adapters.** One adapter per allowlisted source (e.g. an exchange's daily candle endpoint, CoinGecko). Each returns `{ value, timestamp, sourceUrl }`.
*Done when:* adapters return correct historical values for 5 known dates (checked by hand).

**5.2 Resolver bot.** At `resolveBy`: read the source named in the rules → build evidence JSON → pin to IPFS → `propose` with bond.
*Done when:* on testnet, 3 markets resolve YES, NO and INVALID end to end.

**5.3 Disputes.** UI to dispute (bond shown clearly, confirmed with React Bits **HoldButton**), arbitrator screen in admin, email alert on every dispute.
*Done when:* a dispute test on testnet flips the outcome through `arbitrate`.

**5.4 Finalize + redeem.** Worker finalizes after the window; `/portfolio` shows redeemable winnings with one-click redeem.
*Done when:* a winning wallet redeems and its balance matches the expected payout.

### Phase 6 — Social layer + differentiators (M6, 1–1.5 weeks)

**6.1 Edge score** (plan file B2 #2): record `kol_side` at creation; 24h TWAP of that side's price as `p`; `edge = outcome − p` on resolution; include only YES/NO markets with ≥ 10 captcha-verified unique traders in the first 24h; show average with n.
*Done when:* unit tests reproduce the examples (right at 30¢ → +0.70; wrong at 70¢ → −0.70) and the KOL page shows `+x.xx edge · n calls`.

**6.2 Receipt cards.** `opengraph-image` routes for market and resolution states (1200×630) using the receipt block design (static — share images can't animate); Share button (copy link / native share). On the resolved market page, the receipt block is React Bits **TearTicket**: tearing the stub opens Share, and a plain Share button sits next to it.
*Done when:* pasting a market link into X's post composer shows the card; the resolved version shows the stamp; tearing the ticket and pressing the Share button both open the same share options, including by keyboard.

**6.3 In-app notifications.** `notify:fanout` job writes rows for followers (new market), watchers and holders (resolved, redeemable) and submitters (approved/rejected). Delivery: **Server-Sent Events from Fastify** fed by Redis pub/sub, with a 30s polling fallback. Bell (React Bits **BellToggle**, rings once per new notification) + dropdown list (**AnimatedList**) + `/notifications` with read/unread.
*Note:* this replaces "Supabase Realtime" from plan file B6 #4, because users sign in with SIWE, not Supabase Auth, and SSE keeps each user's stream private without extra auth plumbing.
*Done when:* resolving a watched market shows the notification in an open tab within 5 seconds.

**6.4 Follow, watchlist, callouts.** Follow KOLs, watch markets, callouts linked to a market (like, reply, report, rate-limited).
*Done when:* the home feed's Following tab shows only followed KOLs' markets.

**6.5 `/takedown`.** Request form → admin queue → `excluded` flag on the KOL; excluded KOLs are skipped by ingest and validators.
*Done when:* excluding a KOL stops new drafts for them.

**6.6 `/insights`.** Totals, YES/NO/INVALID split, per category, methodology text (how hit rate and edge are computed).
*Done when:* numbers match DB queries.

### Phase 7 — Hardening + mainnet (M7, 1–2 weeks)

**7.1 Security pass.** Slither clean, external review of contracts, fix findings; CSP headers; dependency pinning; rate limits on every write route.
*Done when:* findings list in `docs/security.md` with each item fixed or explained.

**7.2 Keys and roles.** Multisig + timelock for admin/arbiter (after checking what's available on Robinhood Chain, B12 V5); separate keys for creator, resolver, faucet signer; no role on a personal wallet.
*Done when:* a role table in the runbook, each role checked onchain.

**7.3 Outage drills.** Stop scraper, stop Redis, stop RPC provider: each must alert and recover (B12 review gate).
*Done when:* all three drills recorded in the runbook.

**7.4 Legal and copy.** Terms of Service, privacy policy, "demo money / not financial advice" disclaimers; legal opinion (B12 V11) before public launch.
*Done when:* pages published; lawyer's answer recorded.

**7.5 Mainnet deploy.** Deploy to 4663, verify on Blockscout, `deployments/4663.json`, backfill from deploy block, smoke test (claim, buy, sell).
*Done when:* `/contracts` shows all mainnet contracts passing the bytecode check.

**7.6 Launch set.** ~20 KOLs, seeded markets that passed human review, auto-publish still off.
*Done when:* every launch market has a real source post, rules and a named data source.

---

## 4. Timeline

| Week | Phase | Main output |
|---|---|---|
| 1 | 0 + start 1 | Monorepo, DB, CI; DemoUSD + OutcomeTokens |
| 2–3 | 1 | MarketHub, Factory, Resolver, fuzz/invariants |
| 4 | 1 → 2 | Testnet deploy; indexer + backfill |
| 5 | 2 → 3 | API; tokens, fonts, styleguide |
| 6–7 | 3 | Pages, wallet, faucet, trading on testnet |
| 8–9 | 4 | Scraper, AI passes, review queue, `/submit` |
| 10 | 5 | Resolution, disputes, redeem |
| 11 | 6 | Edge score, receipt cards, notifications, follow/callouts |
| 12–13 | 7 | Hardening, drills, legal, mainnet |
| 14–15 | buffer | Slippage in any phase (plan file estimate: 11–15 weeks) |

---

## 5. Testing strategy

| Layer | Tool | Must cover |
|---|---|---|
| Contracts | Foundry unit + fuzz + invariant, Slither | Every function, the invariants in 1.6 |
| Quote math | Vitest vs contract | TS = Solidity exactly |
| API | Vitest + Supertest | Validation, auth, rate limits |
| Worker | Vitest with a local Anvil chain | Indexer reorg/backfill, idempotent jobs |
| AI | Labelled sample (200 posts) | Schema validity, precision/recall of `is_prediction`, AI vs human agreement |
| Web | Playwright | Claim → buy → sell → redeem; `/submit`; notification arrival |
| Accessibility | Lighthouse, axe | ≥ 95; focus rings; YES/NO not color-only |
| Motion | Playwright with `reducedMotion: 'reduce'` + bundle report | Every page usable and complete with reduced motion; ≤ +30 KB gzipped animation code per route |

---

## 6. Environment variables

```
# Chain
CHAIN_ID=46630
RPC_URL=
RPC_URL_BACKUP=
DEPLOYER_PRIVATE_KEY=          # deploy only; never on servers
CREATOR_PRIVATE_KEY=           # worker: createMarket
RESOLVER_PRIVATE_KEY=          # worker: propose/finalize
FAUCET_SIGNER_PRIVATE_KEY=     # API: faucet vouchers

# Data
DATABASE_URL=
DIRECT_URL=
REDIS_URL=

# Services
SCRAPER_URL=
SCRAPER_ENABLED=true           # kill switch (plan file B6b)
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-4-5-20251001
IPFS_PIN_TOKEN=
TURNSTILE_SECRET=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ALERT_EMAIL_TO=

# Auth
SIWE_DOMAIN=
SESSION_SECRET=
ADMIN_ADDRESSES=
```

---

## 7. Cross-references
- Risks: plan file B10 (R1–R28). Highest to watch during build: R6 (no ingest fallback), R12 (faucet sybils), R15 (contract bugs), R25 (scraping legal risk).
- Review gates before testnet, mainnet and real collateral: plan file B12.
- Moderation rules and rollout: plan file B10a.

## Sources (design research)
- React Bits (site): https://reactbits.dev
- React Bits (GitHub, license and source): https://github.com/DavidHDev/react-bits
- Robinhood — new visual identity: https://robinhood.com/us/en/newsroom/a-new-visual-identity/
- Porto Rocha — Robinhood identity case study: https://www.portorocha.com/robinhood
- Kalshi brand kit: https://kalshi.com/brandkit
- Polymarket homepage: https://polymarket.com/
- Polymarket redesign coverage (PANews, 8 Mar 2026): https://panews.io/articles/019cc7eb-115c-770e-9dfa-76fd8cd2e40a
- Limitless: https://limitless.exchange/
- Hyperliquid: https://hyperliquid.xyz/
- Robinhood Chain: https://robinhood.com/us/en/chain/
- Fonts: https://fonts.google.com/specimen/Newsreader · https://fonts.google.com/specimen/IBM+Plex+Sans · https://fonts.google.com/specimen/IBM+Plex+Mono
