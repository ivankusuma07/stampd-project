import type { FastifyReply, FastifyRequest } from "fastify";
import { recoverMessageAddress, isAddressEqual, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import type { Deps } from "../deps";

export const SESSION_COOKIE = "stampd_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;
export const NONCE_TTL_SEC = 10 * 60;

type Session = { w: string; exp: number };

export function readSession(req: FastifyRequest, now: Date): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const s = JSON.parse(unsigned.value) as Session;
    if (typeof s.w !== "string" || s.exp * 1000 < now.getTime()) return null;
    return s.w;
  } catch {
    return null;
  }
}

export function writeSession(reply: FastifyReply, wallet: string, now: Date, secure: boolean) {
  const session: Session = { w: wallet.toLowerCase(), exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SEC };
  reply.setCookie(SESSION_COOKIE, JSON.stringify(session), {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export type SiweCheck = { ok: true; address: string } | { ok: false; error: string };

/**
 * Verify a Sign-In with Ethereum message. EOAs are checked locally by signature recovery; if
 * that fails, the chain is asked (ERC-1271 / ERC-6492 smart wallets).
 */
export async function verifySiwe(
  deps: Pick<Deps, "env" | "kv" | "chain" | "now">,
  message: string,
  signature: Hex,
): Promise<SiweCheck> {
  const fields = parseSiweMessage(message);
  if (!fields.address || !fields.nonce || !fields.domain) return { ok: false, error: "malformed message" };
  if (fields.domain !== deps.env.SIWE_DOMAIN) return { ok: false, error: "wrong domain" };
  if (fields.chainId !== deps.env.CHAIN_ID) return { ok: false, error: "wrong chain" };
  const now = deps.now();
  if (fields.expirationTime && fields.expirationTime < now) return { ok: false, error: "message expired" };
  if (fields.notBefore && fields.notBefore > now) return { ok: false, error: "message not yet valid" };
  // one-time nonce issued by GET /auth/nonce
  if (!(await deps.kv.take(`siwe:nonce:${fields.nonce}`))) return { ok: false, error: "unknown or used nonce" };

  try {
    const recovered = await recoverMessageAddress({ message, signature });
    if (isAddressEqual(recovered, fields.address)) return { ok: true, address: fields.address.toLowerCase() };
  } catch {
    // not an EOA signature; fall through to the onchain check
  }
  const valid = await deps.chain
    .verifySiweMessage({ message, signature, domain: deps.env.SIWE_DOMAIN, nonce: fields.nonce, time: now })
    .catch(() => false);
  return valid ? { ok: true, address: fields.address.toLowerCase() } : { ok: false, error: "bad signature" };
}
