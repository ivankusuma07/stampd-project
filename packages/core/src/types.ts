/** Shapes shared by the scraper client, worker, API and web app (plan file B6b). */

export type XPost = {
  id: string;
  authorId: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  url: string;
  replyToId?: string;
  quotedId?: string;
  isRepost?: boolean;
};

export type XUser = { id: string; handle: string; name: string; avatarUrl: string };

export type MarketStatus = "OPEN" | "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED";
export type MarketResult = "YES" | "NO" | "INVALID";

/** Onchain `MarketHub.Result` enum order. */
export const RESULT_FROM_CHAIN = [null, "NO", "YES", "INVALID"] as const;
export const RESULT_TO_CHAIN = { NO: 1, YES: 2, INVALID: 3 } as const;

export type NotificationType = "NEW_MARKET" | "RESOLVED" | "REDEEMABLE" | "SUBMISSION";

export const CATEGORIES = ["crypto", "macro", "stocks", "tech", "politics", "sports"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Parse an x.com / twitter.com status URL. Returns the numeric post id or null. */
export function parsePostUrl(input: string): { handle: string; id: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|mobile\.)/, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const m = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,20})\/?/);
  if (!m) return null;
  return { handle: m[1]!, id: m[2]! };
}
