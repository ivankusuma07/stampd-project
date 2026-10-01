import type { Metadata } from "next";
import { CountUp, EmptyState, SectionHeading, SpotlightCard } from "@stampd/ui";
import { serverGet } from "@/lib/api";
import type { Insights } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Insights & methodology" };
export const revalidate = 60;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <SpotlightCard className="px-5 py-4">
      <dt className="text-[10px] tracking-[0.2em] text-ink-3 uppercase">{label}</dt>
      <dd className="mt-1 font-display text-4xl font-extrabold text-ink">
        <CountUp to={value} duration={1.4} separator="," />
      </dd>
    </SpotlightCard>
  );
}

/** One labelled horizontal bar; width is share of the largest value. */
function Bar({ label, value, max, sub, color }: { label: string; value: number; max: number; sub?: string; color: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink capitalize">{label}</span>
        <span className="font-mono text-ink-2">
          {value}
          {sub ? <span className="ml-2 text-ink-3">{sub}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
    </li>
  );
}

/** Development plan 6.6: totals from the database and the method behind every number. */
export default async function InsightsPage() {
  const d = await serverGet<Insights>("/insights", 60);
  const pct = (n: number, of: number) => (of === 0 ? "-" : `${Math.round((n / of) * 100)}%`);

  return (
    <div className="space-y-12">
      <PageHeader eyebrow="By the numbers" title="Insights" tone="cyan">
        How the markets have played out so far, and how well the crowd&apos;s odds matched reality.
      </PageHeader>

      {!d ? (
        <EmptyState title="Numbers are unavailable right now" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Markets" value={d.markets} />
            <Stat label="Resolved" value={d.resolved} />
            <Stat label="Trades" value={d.trades} />
            <Stat label="Traders" value={d.traders} />
          </dl>

          <section>
            <SectionHeading eyebrow="Settled markets">Results</SectionHeading>
            {d.resolved === 0 ? (
              <p className="text-ink-2">No market has resolved yet.</p>
            ) : (
              <ul className="max-w-xl space-y-4 rounded-2xl border border-rule bg-surface/70 p-5 backdrop-blur">
                {(["YES", "NO", "INVALID"] as const).map((r) => (
                  <Bar
                    key={r}
                    label={r}
                    value={d.results[r]}
                    max={d.resolved}
                    sub={pct(d.results[r], d.resolved)}
                    color={r === "YES" ? "bg-yes" : r === "NO" ? "bg-no" : "bg-ink-3"}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading eyebrow="What people call">Markets by category</SectionHeading>
            {d.byCategory.length === 0 ? (
              <p className="text-ink-2">No markets yet.</p>
            ) : (
              <ul className="max-w-xl space-y-4 rounded-2xl border border-rule bg-surface/70 p-5 backdrop-blur">
                {d.byCategory.map((c) => (
                  <Bar
                    key={c.category}
                    label={c.category}
                    value={c.markets}
                    max={Math.max(...d.byCategory.map((x) => x.markets))}
                    color="bg-gradient-to-r from-brand-2 via-brand-3 to-brand"
                  />
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm text-ink-3">{d.trackedKols} KOLs tracked.</p>
          </section>
        </>
      )}

      <section id="method" className="max-w-prose space-y-4">
        <SectionHeading>Methodology</SectionHeading>
        <h3 className="font-serif text-xl font-semibold">From post to market</h3>
        <p>
          Posts from tracked accounts, and links people paste on the Submit page, are read by an AI model that drafts a
          question, rules and a data source. Code then checks the deadline, the data source and duplicates; a second AI
          pass checks the draft against the post; and a person reviews it before it is listed. Posts are only used to
          find predictions, never to decide a result.
        </p>
        <h3 className="font-serif text-xl font-semibold">Prices</h3>
        <p>
          Each market is a fixed-product market maker. The YES price is the crowd&apos;s probability: YES and NO always add up to
          100¢. Winning shares pay 1.00 demo USD, losing shares 0, and a VOID (invalid) market pays 0.50 per share of either side.
        </p>
        <h3 className="font-serif text-xl font-semibold">Resolution</h3>
        <p>
          After the deadline, the resolver reads the source named in the rules and proposes the result onchain with its
          evidence and a bond. Anyone can dispute within 6 hours by posting the same bond; disputed markets are decided by
          the arbiter multisig. The rules&apos; hash is stored onchain when the market opens, so they can&apos;t change.
        </p>
        <h3 className="font-serif text-xl font-semibold">Hit rate</h3>
        <p>
          Calls that resolved the KOL&apos;s way, divided by calls that resolved YES or NO. Void markets are shown separately and
          never count for or against. Always shown with the number of calls.
        </p>
        <h3 className="font-serif text-xl font-semibold">Edge</h3>
        <p>
          For each call, <code className="font-mono">edge = outcome − p</code>, where outcome is 1 if the KOL was right and 0 if
          wrong, and <code className="font-mono">p</code> is the crowd&apos;s time-weighted price of the KOL&apos;s side over the first
          24 hours, starting from the first trade (the opening odds we set never count). Right on a call priced at 30¢ scores
          +0.70; wrong on one priced at 70¢ scores −0.70. A KOL&apos;s edge is the average, shown with n. A call counts only if at
          least 10 captcha-verified wallets traded it in its first 24 hours, so thin demo-money markets can&apos;t swing it.
        </p>
        <h3 className="font-serif text-xl font-semibold">Money</h3>
        <p>
          Everything is demo USD from the faucet. It has no value, can&apos;t be sent to other people and can&apos;t be cashed out.
        </p>
      </section>
    </div>
  );
}
