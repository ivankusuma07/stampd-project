import type { MarketSpec, XPost } from "@stampd/core";
import type { ExtractedClaim } from "./schema";
import { sourceFor } from "./allowlist";

const DAY_MS = 86_400_000;

/**
 * Turn an approved draft into the immutable market spec whose hash goes onchain.
 * Trading closes at the deadline; the resolver has one extra day to read the source.
 */
export function buildSpec(claim: ExtractedClaim, post: XPost, deadline: Date): MarketSpec {
  const source = sourceFor(claim.resolution_source);
  return {
    version: 1,
    question: claim.question.trim(),
    rules: claim.rules.trim(),
    category: claim.category,
    kolHandle: post.authorHandle,
    kolSide: claim.kol_side,
    sourcePostUrl: post.url,
    sourcePostId: post.id,
    closeTime: deadline.toISOString(),
    resolveBy: new Date(deadline.getTime() + DAY_MS).toISOString(),
    resolution: {
      source: claim.resolution_source,
      url: source?.docsUrl ?? "",
      subject: claim.subject.toUpperCase(),
      metric: claim.metric,
      comparator: claim.comparator,
      threshold: claim.threshold.trim(),
      mode: "any-close-before",
    },
  };
}
