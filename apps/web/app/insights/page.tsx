import type { Metadata } from "next";
import { EmptyState, SectionHeading } from "@stampd/ui";
import { formatInt } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { Insights } from "@/lib/types";

export const metadata: Metadata = { title: "Insights & methodology" };
export const revalidate = 60;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-ink pt-2">
      <dt className="text-xs tracking-[0.08em] text-ink-3 uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-3xl">{value}</dd>
    </div>
  );
}

/** Development plan 6.6: totals from the database and the method behind every number. */
export default async function InsightsPage() {
  const d = await serverGet<Insights>("/insights", 60);
  const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`);

  return (
    <div className="space-y-12">
      <h1 className="font-serif text-3xl font-semibold">Insights</h1>

      {!d ? (
        <EmptyState title="Numbers are unavailable right now" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat label="Markets" value={formatInt(d.markets)} />
            <Stat label="Resolved" value={formatInt(d.resolved)} />
            <Stat label="Trades" value={formatInt(d.trades)} />
            <Stat label="Traders" value={formatInt(d.traders)} />
          </dl>

          <section>
            <SectionHeading>Results</SectionHeading>
            {d.resolved === 0 ? (
              <p className="text-ink-2">No market has resolved yet.</p>
            ) : (
              <table className="w-full max-w-md font-mono text-sm">
                <tbody>
                  {(["YES", "NO", "INVALID"] as const).map((r) => (
                    <tr key={r} className="border-b border-rule">
                      <th className="py-2 text-left font-normal">{r}</th>
                      <td className="py-2 text-right">{d.results[r]}</td>
                      <td className="py-2 text-right text-ink-3">{pct(d.results[r], d.resolved)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <SectionHeading>Markets by category</SectionHeading>
            {d.byCategory.length === 0 ? (
              <p className="text-ink-2">No markets yet.</p>
            ) : (
              <table className="w-full max-w-md font-mono text-sm">
                <tbody>
                  {d.byCategory.map((c) => (
                    <tr key={c.category} className="border-b border-rule">
                      <th className="py-2 text-left font-normal capitalize">{c.category}</th>
                      <td className="py-2 text-right">{c.markets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          find predictions — never to decide a result.
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
