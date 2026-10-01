/**
 * Cloudflare Turnstile server-side check (Siteverify). Without a secret (local dev only — index.ts
 * refuses to start in production without one) every token passes.
 *
 * Beyond `success`, the token must have been solved on our own site (`hostname`) for the action we
 * asked for (`action`), so a token from another page or widget can't be replayed here. Tokens are
 * single-use and expire after 300 s; Siteverify enforces that.
 */
export type TurnstileExpect = { hostname?: string; action?: string };

// Cloudflare's documented dummy secrets (1x/2x/3x…) report hostname "example.com", so the hostname
// check only applies to a real widget's secret.
const TEST_SECRET = /^[123]x0{30,}AA$/;

export async function verifyTurnstile(secret: string | undefined, token: string, ip: string, expect: TurnstileExpect = {}): Promise<boolean> {
  if (!secret) return true;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean; hostname?: string; action?: string };
  if (data.success !== true) return false;
  if (expect.hostname && !TEST_SECRET.test(secret) && data.hostname !== expect.hostname) return false;
  if (expect.action && data.action && data.action !== expect.action) return false;
  return true;
}
