# STAMPD Design System: "Neon Receipt"

How STAMPD looks, moves and speaks. Read this before you change anything a user can see.

**Sources of truth**, in order:

1. [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css): every colour, font role, keyframe and utility class.
2. [`packages/ui/src/components.tsx`](packages/ui/src/components.tsx) and [`packages/ui/src/bits/`](packages/ui/src/bits/): the primitives and the adapted React Bits.
3. [`docs/decisions.md`](docs/decisions.md) **D14** (the visual direction) and **D10** (how React Bits were adapted).
4. `/styleguide` in the web app: every token and component rendered live in both themes.

[`development-plan.md`](development-plan.md) §1 describes the original "paper and ink" theme. **D14 replaced its colours, fonts and "no glow" rules.** Rules from §1 that still apply are restated below; if something is only in §1 and not here, treat it as superseded.

---

## 1. Principles

1. **Every call gets a receipt.** The till receipt is the product's signature: dashed rules, mono label/value lines, a rotated stamp, the tx hash. Keep it recognisable everywhere a result is shown.
2. **Real numbers or nothing.** Every figure is live data or a clearly labelled empty state (`<EmptyState>`). No placeholder stats, no fake "live" counters. Mock and sample values appear only on `/styleguide`, labelled as samples.
3. **A rate always carries its sample size.** `75% hit · 4 calls`, `+0.12 edge · 18 calls`. Never a bare percentage for a KOL.
4. **YES/NO carry the word, never colour alone.** `YES 56¢`, not a green `56¢`. Colour reinforces; text carries meaning.
5. **Dark and neon by default, readable always.** Near-black canvas, neon lime brand, violet and cyan as supporting accents. Glows and gradients are allowed (D14), but body text stays legible and nothing scrolls sideways at 390 px.
6. **Motion is a bonus, never a requirement.** Everything works and reads the same under `prefers-reduced-motion: reduce`, just still.

---

## 2. Colour

All colours are CSS variables on `:root` (dark, the default) and `:root[data-theme="light"]`, exposed to Tailwind v4 via `@theme inline`. Use the Tailwind names (`bg-surface`, `text-ink-2`, `border-rule`, `bg-yes-bg`) or `var(--token)`. **Never hardcode a hex in app or UI code**; `check:bits` enforces this inside `src/bits`.

### Tokens

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `paper` | `#06070a` | `#f4f5f7` | Page background |
| `surface` | `#0d0f14` | `#ffffff` | Cards, panels (usually at `/80` with `backdrop-blur`) |
| `surface-2` | `#141821` | `#eef0f4` | Inputs, pills, hover fills |
| `ink` | `#f3f5f7` | `#0a0c10` | Primary text, headlines, figures |
| `ink-2` | `#a9b0c0` | `#454c5c` | Secondary text, body copy under headings |
| `ink-3` | `#737c8f` | `#5f6778` | Meta: dates, handles, table headers, eyebrows |
| `rule` | `#1c212c` | `#e1e4ea` | Card borders, dividers |
| `rule-strong` | `#2e3546` | `#9aa1b0` | Input borders, hover borders, receipt dashes |
| `brand` | `#c8ff2e` | `#c8ff2e` | Neon lime. Fills: primary button, active nav, rotating hero word, selection |
| `brand-ink` | `#0a0c07` | `#0a0c07` | Text on `brand` |
| `brand-2` | `#8b7cff` | `#6d5cf5` | Violet: glows, gradients, `PageHeader tone="violet"` |
| `brand-3` | `#2de2e6` | `#0fb5ba` | Cyan: glows, gradients, `PageHeader tone="cyan"` |
| `accent` | `#c8ff2e` | `#4b7a00` | **Brand colour as text** (links on hover, eyebrows, active tab). Use this, not `text-brand`, so light theme stays readable |
| `yes` / `yes-bg` | `#2be59a` / `#0c2a1f` | `#0a8f5a` / `#ddf5ea` | YES side, gains, live dot |
| `no` / `no-bg` | `#ff5a7a` / `#2d1119` | `#d02850` / `#fbe3e9` | NO side, losses, errors, paused banners |
| `mark` / `mark-ink` | `#c8ff2e` / `#0a0c07` | same | Highlighter behind a few words (`.mark`) |
| `focus` | `#8fb8ff` | `#1f4fd8` | Focus ring only |
| `glow-a`, `glow-b`, `grid-line` | rgba | rgba | Page backdrop only |

### Rules

- **`text-brand` is for text on dark only.** Lime on light paper is unreadable; for brand-coloured text use `text-accent`.
- **`brand` is the one loud colour.** One primary button per view; violet and cyan support it, they never compete for the main action.
- **`yes`/`no` mean outcome, not decoration.** Don't use green for "success" on something unrelated to a YES side or a gain; StatusMark and toasts are the exceptions (done/failed).
- **`mark` is a highlighter**, never a text colour and never a large fill.
- **Theme switching:** dark is the default with no attribute. The header toggle sets `data-theme="light"` and stores `theme` in `localStorage`; an inline script applies it before first paint. Components that must react to the theme (e.g. hiding LightRays on light) observe `data-theme` on `<html>`.

### Contrast (WCAG 2.x, measured against `paper`)

| Pair | Dark | Light |
|---|---|---|
| `ink` | 18.4 | 17.9 |
| `ink-2` | 9.3 | 7.9 |
| `ink-3` | 4.8 | 5.2 |
| `accent` | 17.1 | 4.7 |
| `yes` | 12.3 | **3.8** |
| `no` | 6.7 | 4.7 |
| `focus` | 10.0 | 6.1 |
| `brand-ink` on `brand` | 16.7 | 16.7 |

See [Known gaps](#11-known-gaps) for the pairs below 4.5:1.

---

## 3. Typography

Loaded with `next/font/google` in [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx) and mapped in `tokens.css`.

| Role | Family | Tailwind | Weights | Where |
|---|---|---|---|---|
| Display | **Unbounded** | `font-display` | 500–800 | Page titles, section headings, big prices, stamps, stat values |
| UI and questions | **Manrope** | `font-sans` (default) | 400–800 | Body, labels, buttons, market questions |
| Figures | **JetBrains Mono** | `font-mono` | 400, 500, 700 | Prices, cents, %, volumes, dates, block numbers, addresses, tx hashes, receipt lines |

`font-serif` is a legacy alias for Manrope (the plan's serif was dropped). Prefer `font-sans` in new code.

**Patterns in use**

- Page title: `font-display text-3xl md:text-5xl font-extrabold tracking-tight` (`PageHeader`).
- Section heading: `font-display text-xl md:text-2xl font-bold tracking-tight` (`SectionHeading`).
- Eyebrow / table header / small caps label: `text-xs` or `text-[10px]`, `font-semibold`, `tracking-[0.2em]`, `uppercase`, `text-accent` (eyebrow) or `text-ink-3` (labels).
- Card question: `text-base font-semibold leading-snug line-clamp-3`.
- Big price: `font-display text-3xl font-bold` wrapping a mono `LivePrice`.
- Hero: `font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05]`.

**Every number uses tabular figures.** `.font-mono` and `.num` set `tabular-nums`; add `tabular-nums` to any display-font number. Right-align numeric table columns.

---

## 4. Layout and shape

- **Container:** `mx-auto max-w-7xl px-4 lg:px-6` (1280 px max, 16 px phone gutter). `<main>` adds `py-8`.
- **Breakpoints:** Tailwind defaults. The full header nav appears at `xl`; below it, a horizontally scrolling pill nav sits under the header. The wordmark drops "Markets" below 500 px.
- **No horizontal page scroll at 390 px.** `html` and `body` use `overflow-x: clip` because glows and borders draw past their boxes. Wide tables scroll inside their own `overflow-x-auto` wrapper with a `min-w-[640px]` table.
- **Stacking:** `.backdrop` is fixed at `z-0`; page content is `relative z-10`; header `z-30`; toasts and skip link `z-50`.

**Radius scale** (what the code actually uses):

| Radius | Use |
|---|---|
| `rounded-full` | Buttons, pills, chips, tabs, nav, icon buttons, avatars, progress bars |
| `rounded-xl` | Inputs, colour swatches, small inner panels |
| `rounded-2xl` | Cards, empty states, receipt cards (`18px` on `GlareHover`) |
| `rounded-3xl` | `PageHeader` glass title cards |
| `rounded-md` | Stamps, price-flash highlight |
| `6` (prop) | TearTicket, SwipeToast |

**Control sizes:** buttons and inputs are `h-11`; header icon buttons are `h-10 w-10`. Lucide icons at 16–18 px in controls.

---

## 5. Surfaces and effects

Utility classes defined in `tokens.css`:

| Class / pattern | What it is |
|---|---|
| `.backdrop` | Fixed page background: two soft radial glows (`glow-a` lime top-left, `glow-b` violet top-right) over a 56 px grid that fades out downward. Rendered once in the root layout. |
| Glass card | `rounded-2xl border border-rule bg-surface/80 backdrop-blur` (`<Card>`). The default container. |
| `.glow` | Lime ring plus soft lime drop glow. Featured cards, primary emphasis. |
| `.glow-yes`, `.glow-no` | Side-coloured under-glow for YES/NO actions. |
| `.mark` | Lime highlighter behind words. Wraps cleanly across lines. |
| `.text-gradient` | Static lime to cyan to violet gradient text for display accents. `<GradientText>` is the animated version. |
| `.receipt-rule` | `1px dashed rule-strong` top border. Dashed rules belong to receipts only. |
| `.flash-up`, `.flash-down` | 600 ms `yes`/`no` background flash on a changed price. |
| Corner glow | A blurred `h-72 w-72 rounded-full blur-3xl bg-brand/15` (or `brand-2`, `brand-3`) positioned off a card corner, `aria-hidden`, `pointer-events-none`. Used by `PageHeader`. |

Buttons and the active nav pill carry an inline brand glow: `shadow-[0_8px_30px_-8px_var(--brand)]`. Keep glows tinted by a token, never by a raw colour.

---

## 6. Components

### Primitives (`@stampd/ui`)

| Component | Notes |
|---|---|
| `Button`, `LinkButton` | Variants `primary` (lime fill), `secondary` (glass outline), `ghost`, `yes`, `no`. Pill, `h-11`. One `primary` per view. Disabled drops the glow and goes 50% opacity. |
| `Input` | `h-11 rounded-xl bg-surface-2 border-rule-strong`, border turns `brand/60` on focus. |
| `Tabs` + `tabClass(active)` | Pill tabs. Caller renders `role="tab"` links or buttons. Active: `border-brand/50 bg-brand/10 text-accent`. Also used for chart ranges. |
| `Card` | Glass card container. |
| `SectionHeading` | Optional eyebrow, display heading, optional right-aligned `aside` (links turn `accent` on hover). |
| `Pill` | Small neutral label. |
| `PriceChip` | `YES 56¢` pill on the side's `-bg` fill. |
| `Change` | 24 h change: lucide `TrendingUp`/`TrendingDown` plus signed cents. No arrow when unchanged; `-` when unknown. |
| `ProbabilityBar` | YES/NO split bar with a glowing YES fill and an `aria-label` giving both percentages. |
| `ProbabilityRing` | Circular YES gauge with the % in display type. |
| `EdgeBadge`, `HitRate` | Track record with sample size; `EdgeBadge` explains the formula in a `title` and in `sr-only` text. |
| `ReceiptBlock` | Dashed-rule till receipt: mono `dl` with uppercase `ink-3` labels; optional stamp bottom-right. |
| `Stamp` | `CALLED IT` (lime), `MISSED` (`no`), `VOID` (`ink-3`). Display font, wide tracking, rotated -3°. Never an emoji. |
| `Avatar` | Real X avatar, or initials on a conic brand gradient. **Never a generated face.** |
| `LiveDot` | Pulsing `yes` dot for live things (block number, live badge). |
| `EmptyState` | Dashed card with a lucide `Sparkles` badge, title and one line of help. Use it instead of zeros or made-up rows. |

### App components (`apps/web/components`)

- `PageHeader`: glass title card for secondary pages (eyebrow, display title, blurb, optional controls, `tone` for the corner glow).
- `MarketCard`: `SpotlightCard` with KOL row, question, big YES `LivePrice`, `Change`, NO price, `ProbabilityBar`, volume and time left. Lifts `-translate-y-0.5` on hover.
- `MiniReceipt`: resolved-call card on `GlareHover`; the tx hash decrypts into view; stamp bottom-right.
- `LivePrice`: cents via `Counter` (rolls from old to new value, never from 0) plus the 600 ms flash.
- `PriceChart`: Recharts step area. `accent` 2 px line over a fading gradient fill, dashed `rule` horizontal grid, mono `ink-3` ticks at 11 px, dashed crosshair, mono tooltip.
- `ContractAddress`: glass pill reading `CA` plus the address in mono (short form on phones) with a lucide copy button, in the hero under the CTAs and in the footer. Until `NEXT_PUBLIC_CONTRACT_ADDRESS` is set it reads "To be announced"; never fill it with a guessed or sample address.
- `Toasts`: `SwipeToast` for transactions. Fuse colour by tone (`ink` pending, `yes` confirmed, `no` failed), tx hash in mono linking to the explorer. At most three on screen.
- Tables: `w-full text-sm`; header row `border-b border-rule text-[10px] tracking-[0.2em] uppercase text-ink-3`; numeric columns `text-right font-mono`.

---

## 7. Motion

**Library:** `motion` for React animation, `ogl` for the one WebGL effect. **three.js, gsap and Hugeicons are banned** (`check:bits`).

**React Bits in use** (copied into `packages/ui/src/bits/`, restyled to tokens):

| Bit | Where |
|---|---|
| `Counter`, `SplitFlapText` | Prices that change (roll / flip from old value to new) |
| `CountUp` | Headline stats (home hero, `/insights`), never prices |
| `RotatingText`, `BlurText`, `ShinyText`, `GradientText` | Hero and display accents |
| `DecryptedText` | Tx hash on resolved receipts |
| `LightRays` (WebGL) | Home hero, dark theme only, `next/dynamic` with `ssr: false` |
| `SpotlightCard`, `GlareHover`, `StarBorder`, `ElectricBorder`, `Magnet`, `ClickSpark` | Card and CTA interactions |
| `TearTicket` | Receipt on a resolved market; tearing the stub opens Share. A plain Share button always sits beside it. |
| `HoldButton` | "Hold to dispute" only. Never for normal trades. |
| `BellToggle`, `AnimatedList` | Notifications, activity feeds |
| `StatusMark` | Submission status; label always visible |
| `SwipeToast` | Transaction toasts |
| `FadeContent` | One-time fade-up on scroll |
| `Noise`, `LogoLoop` | Grain texture; logo strip |

**Rules**

- **Reduced motion is mandatory.** Use `useCalm()` from `@stampd/ui` for any animated piece that doesn't handle it itself. Under reduced motion: prices render as plain text immediately (an e2e test checks this), WebGL is not mounted, the electric border, star border, pulse dot and price flashes stop.
- **Prices never animate from 0.** They roll from the previous value. A price change flashes for 600 ms, no longer.
- **WebGL is client-only and lazy**: `dynamic(..., { ssr: false })`, and only when `useCalm()` is false.
- **Additive light effects are dark-theme only.** LightRays reads as a grey panel on light, so it is hidden there. Check any new glow effect in both themes.
- **Hover feedback is small:** `transition`, `hover:-translate-y-0.5`, `hover:brightness-110`, border to `rule-strong`, text to `accent`.
- **Bits must not trap the keyboard.** (AnimatedList's window-level key handler was removed for this reason, D10.)

---

## 8. Icons

**lucide-react only.** Never text glyphs (▲ ▼ ↗ → ✦), never emoji, never another icon set.

- Size 16–18 px in controls, `size="1em"` inline with text.
- `strokeWidth` 1.5 to 1.75 for UI icons, up to 2.25 for small inline trend arrows.
- Decorative icons get `aria-hidden`; icon-only buttons get an `aria-label` (and usually a `title`).
- The only non-icon decorative shapes are animated pieces: the probability ring, ticket outlines and the logo stamp.
- One brand-logo exception: the X mark (`XLogo` in `apps/web/components/x-link.tsx`), because lucide's `X` is a close cross.

---

## 9. Numbers and data

Format through `@stampd/core` so every surface agrees:

| Helper | Output |
|---|---|
| `formatCents(bps)` | `56¢` |
| `formatCentsDelta(bps)` | signed cents change |
| `formatPercent(bps)` | `56.0%` |
| `formatUsd(amount, { compact })` | demo USD, compact for volumes |
| `formatShares(amount)` | share amounts |
| `formatEdge(avgEdge, n)` | `+0.12 edge · 18 calls` |
| `formatInt(n)` | `72,104,388` |
| `shortHash(hash)` | `0x4b1e…9a0c` |
| `formatDateUtc`, `formatDateTimeUtc`, `formatCountdown` | UTC dates and time left |

- Prices are stored in basis points; NO price is always `10_000 - yesBps`.
- Dates are UTC. Relative time ("3h left") uses `RelativeTime`.
- `·` (middle dot) separates inline facts: `@handle · 12 Mar 2026`, `$12k vol · 3d left`.
- Unknown values render as `-` in `ink-3`, never `0`.

---

## 10. Words

User-facing copy is checked by `node scripts/check-copy.mjs` (part of `pnpm verify`).

- **No em dashes** in anything a user can read, including API and worker messages that reach the UI. Use a colon, comma, full stop or `·`.
- **Neutral about people.** Never rank or mock KOLs ("worst predictor", "bad call", "clown", "hall of shame" all fail the build). Show the record and let it speak.
- **Demo money only.** Never imply real-money value: no "cash out", "withdraw winnings", "real money", "guaranteed returns", "airdrop". Sentences that say what dUSD is *not* ("can't be cashed out", "no value") are allowed.
- **Plain and specific.** Banners say what happened and what still works ("New markets paused. ... Trading, resolution and redemption carry on as normal.").
- Brand: `STAMPD` in caps; the wordmark is `STAMPD Markets`. Stamps are `CALLED IT`, `MISSED`, `VOID`.
- X account: [@StampDCreator](https://x.com/StampDCreator), set through `NEXT_PUBLIC_X_URL`. The header icon and the footer "Follow @StampDCreator on X" link stay hidden until it is set. The X mark is the official logo as inline SVG (`XLogo`), the one allowed exception to lucide-only, since lucide has no brand logos.

---

## 11. Known gaps

Measured against the current tokens; fix by adjusting the light-theme or button values in `tokens.css` and re-measuring.

| Pair | Ratio | Where it shows |
|---|---|---|
| Light `yes` on `paper` | 3.8 | YES prices and gains as small text on light |
| Light `yes` on `yes-bg` | 3.6 | `PriceChip` YES on light |
| Light `no` on `no-bg` | 4.2 | `PriceChip` NO on light |
| White on dark `no` | 3.0 | `Button variant="no"` and `MISSED` stamp on dark |
| Light `brand-3` on `paper` | 2.3 | Only acceptable as a glow or gradient stop, never as text |
| `rule-strong` on `paper` | 1.6 dark / 2.4 light | Input borders fall below the 3:1 non-text target |

`tokens.css` states that body text meets AA in both themes; `ink`, `ink-2`, `ink-3` and `accent` do, the side colours above do not yet on light.

---

## 12. Changing the system

1. Change tokens in `tokens.css` (both themes) or primitives in `components.tsx`. Don't fork a one-off style in an app page if it belongs in `@stampd/ui`.
2. Check `/styleguide` in dark, light and with OS reduced motion on.
3. Run `pnpm verify` (copy check and `check:bits` included). For UI changes, `pnpm --filter @stampd/web test:e2e` covers every page, the 390 px phone screen and reduced motion.
4. If the change alters a rule in this file (a new colour role, a new bit, a lifted ban), record it as a new `D` entry in [`docs/decisions.md`](docs/decisions.md) and update this file in the same commit.
5. New React Bits: install the TS + Tailwind variant into `packages/ui/src/bits/<Name>/`, replace raw colours with tokens (or add a `check-bits: raw-colours` comment saying why a canvas needs one), swap any Hugeicons for lucide, wire reduced motion, export it from `src/index.ts`. React Bits is MIT + Commons Clause: never publish `@stampd/ui` on its own.
