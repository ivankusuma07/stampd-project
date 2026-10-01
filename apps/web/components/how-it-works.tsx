"use client";

import { GradientText, SpotlightCard } from "@stampd/ui";

const STEPS = [
  {
    title: "The call",
    body: "A KOL posts a dated, checkable prediction on X, or you paste one in. AI drafts the market; a human checks it.",
  },
  {
    title: "The market",
    body: "It opens onchain as YES/NO. The price is the crowd's odds, and the rules are hashed onchain so they can't change.",
  },
  {
    title: "The verdict",
    body: "At the deadline the resolver reads the named data source and proposes the result, with a dispute window and evidence.",
  },
  {
    title: "The receipt",
    body: "Winners redeem 1.00 per share. The KOL's record updates: hit rate and edge (how much they beat the crowd).",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <SpotlightCard key={s.title} className="h-full p-6">
          <GradientText className="mx-0! font-display text-4xl font-extrabold" animationSpeed={6}>
            {`0${i + 1}`}
          </GradientText>
          <h3 className="mt-5 font-display text-lg font-bold text-ink">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
        </SpotlightCard>
      ))}
    </div>
  );
}
