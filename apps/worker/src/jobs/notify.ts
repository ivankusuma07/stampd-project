import type { NotificationType, PrismaClient } from "@stampd/db";
import type { NotifyEvent } from "@stampd/queue";

export type Publish = (wallet: string, payload: string) => Promise<unknown>;

type Row = { userWallet: string; type: NotificationType; refId: string; title: string; body: string; href: string };

const SUBMITTER_POINTS = 10;

/**
 * `notify.fanout` (plan B6 #4, development plan 6.3): write one row per affected user, then
 * signal their open tabs. Idempotent: (user, type, ref) is unique, and only newly created rows
 * are signalled. Notifications stay in the app; nothing is sent elsewhere.
 */
export async function fanout(db: PrismaClient, publish: Publish, event: NotifyEvent): Promise<number> {
  const rows: Row[] = [];

  if (event.kind === "market.opened") {
    const m = await db.market.findUniqueOrThrow({ where: { id: event.marketId }, include: { kol: true } });
    const followers = await db.follow.findMany({ where: { kolId: m.kolId }, select: { userWallet: true } });
    for (const f of followers) {
      rows.push({
        userWallet: f.userWallet,
        type: "NEW_MARKET",
        refId: m.id,
        title: `New market on @${m.kol.xHandle}`,
        body: m.question,
        href: `/markets/${m.id}`,
      });
    }
    if (m.submittedBy) {
      const created = await createRows(db, [
        {
          userWallet: m.submittedBy,
          type: "SUBMISSION",
          refId: `${m.id}:live`,
          title: "Your submission is live",
          body: m.question,
          href: `/markets/${m.id}`,
        },
      ]);
      // Points only once, guarded by the unique notification row.
      if (created.length > 0) {
        await db.user.update({ where: { wallet: m.submittedBy }, data: { points: { increment: SUBMITTER_POINTS } } });
        await signal(publish, created);
      }
    }
  }

  if (event.kind === "market.resolved") {
    const m = await db.market.findUniqueOrThrow({ where: { id: event.marketId } });
    const result = m.result ?? "INVALID";
    const [watchers, holders] = await Promise.all([
      db.watch.findMany({ where: { marketId: m.id }, select: { userWallet: true } }),
      db.position.findMany({ where: { marketId: m.id, OR: [{ yesShares: { gt: 0 } }, { noShares: { gt: 0 } }] } }),
    ]);
    const recipients = new Set([...watchers.map((w) => w.userWallet), ...holders.map((h) => h.wallet)]);
    for (const wallet of recipients) {
      rows.push({
        userWallet: wallet,
        type: "RESOLVED",
        refId: m.id,
        title: `Resolved ${result}`,
        body: m.question,
        href: `/markets/${m.id}`,
      });
    }
    for (const h of holders) {
      const winning = result === "YES" ? h.yesShares : result === "NO" ? h.noShares : h.yesShares.add(h.noShares).div(2);
      if (winning.gt(0)) {
        rows.push({
          userWallet: h.wallet,
          type: "REDEEMABLE",
          refId: m.id,
          title: "Winnings ready to redeem",
          body: m.question,
          href: "/portfolio",
        });
      }
    }
  }

  if (event.kind === "submission.updated") {
    const s = await db.submission.findUniqueOrThrow({ where: { id: event.submissionId } });
    if (s.status === "REJECTED") {
      rows.push({
        userWallet: s.wallet,
        type: "SUBMISSION",
        refId: `${s.id}:rejected`,
        title: "Submission not listed",
        body: s.reason ?? "not a checkable prediction",
        href: "/submit",
      });
    }
  }

  const created = await createRows(db, rows);
  await signal(publish, created);
  return created.length;
}

/** Insert rows for wallets that are users; returns only the rows that did not exist yet. */
async function createRows(db: PrismaClient, rows: Row[]): Promise<Row[]> {
  if (rows.length === 0) return [];
  const users = new Set(
    (await db.user.findMany({ where: { wallet: { in: rows.map((r) => r.userWallet) } }, select: { wallet: true } })).map((u) => u.wallet),
  );
  const created: Row[] = [];
  for (const r of rows.filter((r) => users.has(r.userWallet))) {
    const { count } = await db.notification.createMany({ data: [r], skipDuplicates: true });
    if (count === 1) created.push(r);
  }
  return created;
}

async function signal(publish: Publish, rows: Row[]) {
  for (const r of rows) await publish(r.userWallet, JSON.stringify({ type: r.type, refId: r.refId }));
}
