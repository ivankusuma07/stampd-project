import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="max-w-prose space-y-4">
      <h1 className="font-serif text-3xl font-semibold">Privacy</h1>
      <p className="rounded-[4px] border border-dashed border-rule-strong p-3 text-sm text-ink-2">
        Draft pending legal review. The final policy will be published here before public launch.
      </p>
      <h2 className="font-serif text-xl font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your wallet address, and a display name if you set one.</li>
        <li>What you do here: follows, watched markets, callouts, submissions, notifications.</li>
        <li>For the faucet: a one-way hash of your IP address, to limit claims per network. Not the address itself.</li>
        <li>Public posts from X that became drafts or markets. Posts deleted on X are cleared when we notice.</li>
      </ul>
      <h2 className="font-serif text-xl font-semibold">What is public</h2>
      <p>Trades, positions and results are onchain on Robinhood Chain and visible to anyone.</p>
      <h2 className="font-serif text-xl font-semibold">Cookies</h2>
      <p>One session cookie keeps you signed in. We use no advertising or tracking cookies.</p>
    </article>
  );
}
