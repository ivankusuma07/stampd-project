import type { XPost } from "@stampd/core";

/**
 * Cheap filter before any LLM call (development plan 4.3): skip replies, reposts, and posts with
 * no forward-looking wording or no number/date. Target: drop ≥ 60% of posts while keeping every
 * real prediction. Tune the word lists against the labelled sample, not by guesswork.
 */

const FORWARD = [
  /\bwill\b/i,
  /\bgonna\b/i,
  /\bgoing to\b/i,
  /\bby (the )?(end|eo[ywmq]|mid|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|\d)/i,
  /\bbefore\b/i,
  /\buntil\b/i,
  /\beo[ywmq]\b/i,
  /\bnext (week|month|year|quarter|cycle)\b/i,
  /\bthis (week|month|year|quarter|cycle)\b/i,
  /\btarget\b/i,
  /\bpt\b/i,
  /\bexpect(ing)?\b/i,
  /\bpredict(ion)?\b/i,
  /\bcall(ing)? it\b/i,
  /\bmark my words\b/i,
  /\bbet\b/i,
  /\bincoming\b/i,
  /\b(hit|hits|reach|reaches|break|breaks|flip|flips|touch|see|seeing|send|sending)\b/i,
  /\bin \d+ (days|weeks|months|years)\b/i,
  /\bq[1-4]\b/i,
  /\b20\d\d\b/,
];

const NUMBER_OR_DATE = [
  /\$\s?\d/,
  /\d+(\.\d+)?\s?(k|m|b|%)\b/i,
  /\d{2,}/,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\bq[1-4]\b/i,
  /\beo[ywmq]\b/i,
];

export type PrefilterResult = { keep: true } | { keep: false; reason: "reply" | "repost" | "no-forward" | "no-number" };

export function prefilter(post: Pick<XPost, "text" | "replyToId" | "isRepost">): PrefilterResult {
  if (post.isRepost || /^RT @/.test(post.text)) return { keep: false, reason: "repost" };
  if (post.replyToId) return { keep: false, reason: "reply" };
  const text = post.text.replace(/https?:\/\/\S+/g, " ");
  if (!FORWARD.some((r) => r.test(text))) return { keep: false, reason: "no-forward" };
  if (!NUMBER_OR_DATE.some((r) => r.test(text))) return { keep: false, reason: "no-number" };
  return { keep: true };
}
