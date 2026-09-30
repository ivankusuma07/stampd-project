"use client";

import { useState } from "react";
import {
  AnimatedList,
  Avatar,
  BellToggle,
  Button,
  Card,
  Change,
  Counter,
  EdgeBadge,
  EmptyState,
  FadeContent,
  HitRate,
  HoldButton,
  Input,
  PriceChip,
  ReceiptBlock,
  SectionHeading,
  SplitFlapText,
  StatusMark,
  TearTicket,
  Tabs,
  tabClass,
} from "@stampd/ui";

const TOKENS = ["paper", "surface", "ink", "ink-2", "ink-3", "rule", "rule-strong", "yes", "yes-bg", "no", "no-bg", "mark", "focus"];
const SIZES = [
  ["xs", "0.75"],
  ["sm", "0.875"],
  ["base", "1"],
  ["lg", "1.125"],
  ["xl", "1.375"],
  ["2xl", "1.75"],
  ["3xl", "2.25"],
  ["4xl", "3"],
] as const;

/**
 * Styleguide (development plan 3.1, 3.2, 3.2b). Every value on this page is a SAMPLE for
 * checking the design; none of it is market data. Toggle the theme in the header to see both.
 */
export default function StyleguidePage() {
  const [price, setPrice] = useState(56);
  const [unread, setUnread] = useState(2);
  const [rows, setRows] = useState(["Resolved YES", "New market on @example_kol"]);

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">Styleguide</h1>
        <p className="mt-1 text-ink-2">
          <span className="mark">Sample values only</span> — nothing on this page is live data. Switch themes in the header;
          set your OS to reduce motion to check the still versions.
        </p>
      </header>

      <section>
        <SectionHeading>Colour tokens</SectionHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {TOKENS.map((t) => (
            <div key={t} className="text-xs">
              <div className="h-14 rounded-xl border border-rule" style={{ background: `var(--${t})` }} />
              <p className="mt-1 font-mono">--{t}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading>Type</SectionHeading>
        <div className="space-y-2">
          {SIZES.map(([k, rem]) => (
            <p key={k} className="flex items-baseline gap-4" style={{ fontSize: `${rem}rem` }}>
              <span className="w-24 shrink-0 font-mono text-xs text-ink-3">
                {k} · {rem}rem
              </span>
              <span className="font-serif">Will BTC close above $90,000?</span>
            </p>
          ))}
          <p className="font-sans">Manrope — labels, buttons, UI text and market questions.</p>
          <p className="font-mono">JetBrains Mono — 56¢ · $1,234.57 · 0x4b1e…9a0c · 72,104,388</p>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Components</SectionHeading>
        <div className="flex flex-wrap items-center gap-3">
          <PriceChip side="YES" bps={5600} />
          <PriceChip side="NO" bps={4400} />
          <Change bps={1500} />
          <Change bps={-300} />
          <EdgeBadge avgEdge={0.12} n={18} />
          <HitRate rate={0.75} n={4} />
          <Avatar handle="example_kol" size={24} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="yes">Buy YES</Button>
          <Button variant="no">Buy NO</Button>
          <Button disabled>Disabled</Button>
        </div>
        <Input placeholder="Amount (demo USD)" className="max-w-xs" />
        <Tabs label="Sample tabs">
          <button role="tab" aria-selected className={tabClass(true)}>
            Live
          </button>
          <button role="tab" aria-selected={false} className={tabClass(false)}>
            Following
          </button>
        </Tabs>
        <Card className="max-w-md p-4">
          <ReceiptBlock
            lines={[
              { label: "Call", value: "@example_kol · 12 Mar 2026" },
              { label: "Question", value: <span className="font-serif">BTC daily close ≥ $90,000 before 31 Mar 2027?</span> },
              { label: "Result", value: "YES" },
              { label: "Final", value: "100¢ · opened 50¢" },
              { label: "Settled", value: "tx 0x4b1e…9a0c" },
            ]}
            stamp="CALLED IT"
          />
        </Card>
        <EmptyState title="Empty state">Shown instead of made-up numbers.</EmptyState>
      </section>

      <section className="space-y-6">
        <SectionHeading>Motion (React Bits, restyled)</SectionHeading>
        <div className="flex flex-wrap items-center gap-6">
          <span className="inline-flex items-center gap-1">
            <SplitFlapText value={String(price).padStart(2, " ")} fontSize={34} />
            <span className="font-mono text-2xl">¢</span>
          </span>
          <span className="font-mono text-xl">
            <Counter value={price} height={24} suffix="¢" />
          </span>
          <Button variant="secondary" onClick={() => setPrice((p) => (p >= 95 ? 12 : p + 7))}>
            Move price
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <BellToggle count={unread} />
          <Button variant="secondary" onClick={() => setUnread((u) => u + 1)}>
            New notification
          </Button>
          <StatusMark status="pending" label="In review" />
          <StatusMark status="done" label="Approved" />
          <StatusMark status="failed" label="Rejected" />
        </div>
        <div className="max-w-md">
          <AnimatedList className="divide-y divide-rule border-y border-rule" items={rows} getKey={(r) => r} render={(r) => <p className="py-2 text-sm">{r}</p>} />
          <Button variant="ghost" onClick={() => setRows((r) => [`Sample row ${r.length + 1}`, ...r].slice(0, 5))}>
            Add row
          </Button>
        </div>
        <HoldButton holdTime={1500} radius={4}>
          Hold to dispute
        </HoldButton>
        <TearTicket width={340} height={260} stubSize={64} radius={6} holes={9} tilt={false} border borderColor="var(--rule-strong)" stubBackground="var(--paper)" stub={<span className="font-mono text-xs tracking-widest">SHARE</span>}>
          <div className="p-4 font-mono text-sm">Tear the stub →</div>
        </TearTicket>
        <FadeContent>
          <p className="text-sm text-ink-2">This paragraph faded up once when it scrolled into view.</p>
        </FadeContent>
      </section>
    </div>
  );
}
