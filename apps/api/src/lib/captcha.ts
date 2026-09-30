/**
 * Cloudflare Turnstile server-side check. Without a secret (local dev only — index.ts refuses to
 * start in production without one) every token passes.
 */
export async function verifyTurnstile(secret: string | undefined, token: string, ip: string): Promise<boolean> {
  if (!secret) return true;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
