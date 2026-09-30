# Moderation playbook (plan B10a)

For reviewers working the /admin → Queue.

## Approve only when all of these hold

1. **It's a real, checkable prediction** — a concrete outcome by a date. Hype ("sending it"), opinions, questions and jokes are not.
2. **The question says what the post says** — same asset, direction, level and deadline. Don't make it stronger or weaker.
3. **The source can settle it without judgement** — an allowlisted source publishes exactly the metric in the rules.
4. **The wording is neutral** — no judgement of the author, no presumed answer. The KOL is named only in the attribution line, never in the question.
5. **The author can't make it happen themselves** (plan R11) — their own launch, purchase or project metric is a reject.
6. **The deadline is at least 24 hours and at most 12 months away.**

If the draft is close, fix it in the edit fields rather than rejecting. Edits are logged, and edited approvals count as disagreement when measuring AI–human agreement.

## Rejecting

Write the reason for the submitter: they see it on /submit and in a notification. Keep it factual: "no deadline in the post", "not a price prediction", "the author controls the outcome".

## Opening price and seed

- Default 50¢ opening odds and 200 dUSD seed.
- Only move the opening price when there's a clear reason. The edge score ignores the opening price (it starts at the first trade), but thin markets still anchor on it.

## After publish

- Flags from users appear in /admin → Markets (flag count).
- A broken market can be paused from /admin → Markets. It can then be settled as INVALID with a manual proposal (/admin → Resolutions), which pays 0.50 per share of either side.
- Takedown requests: /admin → Takedowns. "Exclude KOL" stops new drafts and web submissions for that account. Existing markets are not deleted; decide per market whether to let them run or settle them INVALID.

## Weekly (plan B12 cadence)

AI–human agreement per template, INVALID rate, disputes, flags, faucet claims per IP/wallet, scraper health.
