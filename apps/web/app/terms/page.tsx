import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

// Development plan 7.4: published before launch, after the legal opinion (plan B12 V11).
export default function TermsPage() {
  return (
    <article className="max-w-prose space-y-4">
      <h1 className="font-serif text-3xl font-semibold">Terms of use</h1>
      <p className="rounded-[4px] border border-dashed border-rule-strong p-3 text-sm text-ink-2">
        Draft pending legal review. The final terms will be published here before public launch.
      </p>
      <h2 className="font-serif text-xl font-semibold">What STAMPD is</h2>
      <p>
        STAMPD lists prediction markets on public claims made on X and settles them onchain. It uses demo USD only: a token
        with no monetary value that cannot be sold, transferred to other people or redeemed for money.
      </p>
      <h2 className="font-serif text-xl font-semibold">Not advice</h2>
      <p>Nothing on STAMPD is financial, investment or trading advice. Prices reflect demo trading only.</p>
      <h2 className="font-serif text-xl font-semibold">Markets and results</h2>
      <p>
        Each market&apos;s rules and data source are fixed when it opens. Results are proposed from the named source and can be
        disputed within the dispute window; a market that cannot be settled fairly resolves VOID and pays 0.50 per share.
      </p>
      <h2 className="font-serif text-xl font-semibold">People named in markets</h2>
      <p>
        Markets quote public posts and describe claims neutrally. Anyone can ask for a review or removal on the takedown page.
      </p>
    </article>
  );
}
