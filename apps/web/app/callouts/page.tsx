import type { Metadata } from "next";
import Link from "next/link";
import { Tabs, tabClass } from "@stampd/ui";
import { CalloutFeed } from "@/components/callouts";

export const metadata: Metadata = { title: "Callouts" };

type Search = Promise<{ sort?: string }>;

export default async function CalloutsPage({ searchParams }: { searchParams: Search }) {
  const { sort } = await searchParams;
  const s = sort === "trending" ? "trending" : "latest";
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-serif text-3xl font-semibold">Callouts</h1>
      <p className="text-ink-2">Community takes on live calls. Every callout links to a market; post one from the market page.</p>
      <Tabs label="Sort callouts">
        <Link href="/callouts" className={tabClass(s === "latest")}>
          Latest
        </Link>
        <Link href="/callouts?sort=trending" className={tabClass(s === "trending")}>
          Trending
        </Link>
      </Tabs>
      <CalloutFeed query={`sort=${s}`} showMarket />
    </div>
  );
}
