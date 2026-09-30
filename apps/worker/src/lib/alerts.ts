import type { PrismaClient, Prisma } from "@stampd/db";

export type Alerter = (kind: string, message: string, data?: Prisma.InputJsonValue) => Promise<void>;

/**
 * Raise an admin alert: a SystemAlert row (shown in /admin) and, when configured, an email
 * (plan B4 monitoring). The same unresolved kind+message within an hour is not repeated.
 */
export function createAlerter(
  db: PrismaClient,
  email: { resendKey?: string; to?: string; from: string },
  log: (msg: string) => void = console.warn,
): Alerter {
  return async (kind, message, data) => {
    const recent = await db.systemAlert.findFirst({
      where: { kind, message, resolvedAt: null, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent) return;
    await db.systemAlert.create({ data: { kind, message, data } });
    log(`[alert] ${kind}: ${message}`);
    if (email.resendKey && email.to) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${email.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: email.from,
          to: email.to.split(","),
          subject: `[STAMPD] ${kind}: ${message.slice(0, 120)}`,
          text: `${message}\n\n${data ? JSON.stringify(data, null, 2) : ""}`,
        }),
      }).catch((err: Error) => log(`[alert] email failed: ${err.message}`));
    }
  };
}
