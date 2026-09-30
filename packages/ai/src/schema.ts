import { z } from "zod";
import { CATEGORIES } from "@stampd/core";

/**
 * AI pass 1 output (development plan 4.4). Plain types only — no length/range constraints — so
 * the field list generated into the prompt stays simple; ranges are enforced by `validators.ts`.
 */
export const ExtractedClaim = z.object({
  is_prediction: z.boolean().describe("true only for a concrete, checkable claim about the future"),
  subject: z.string().describe("asset ticker or entity, e.g. BTC; empty when not a prediction"),
  metric: z.string().describe('what is measured, e.g. "daily close"'),
  comparator: z.enum([">=", "<=", ">", "<"]).describe('use ">=" when the post has no comparison'),
  threshold: z.string().describe('plain decimal number as a string, e.g. "90000"; empty when none'),
  deadline_utc: z
    .string()
    .describe("ISO 8601 UTC timestamp of the deadline; empty string when the post gives no date"),
  resolution_source: z.string().describe("an id from the allowed sources list, or empty"),
  question: z.string().describe('neutral YES/NO question, "Will … before <date>?"'),
  rules: z.string().describe("exact resolution rules naming the source, metric, timezone and deadline"),
  category: z.enum(CATEGORIES),
  kol_side: z.enum(["YES", "NO"]).describe("which answer the author is calling"),
  outcome_controlled_by_kol: z.boolean().describe("true if the author can make it happen themselves"),
  confidence: z.number().describe("0 to 1"),
  notes: z.string().describe("one sentence: why this is or is not a checkable prediction"),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

/** AI pass 2 output: an independent checklist over the pass-1 draft (plan B10a). */
export const CheckResult = z.object({
  real_prediction: z.boolean(),
  question_matches_post: z.boolean(),
  resolvable_from_source: z.boolean(),
  neutral_wording: z.boolean(),
  outcome_not_controlled_by_kol: z.boolean(),
  verdict: z.enum(["approve", "review", "reject"]),
  notes: z.string(),
});
export type CheckResult = z.infer<typeof CheckResult>;

export function checklistPasses(c: CheckResult): boolean {
  return (
    c.real_prediction &&
    c.question_matches_post &&
    c.resolvable_from_source &&
    c.neutral_wording &&
    c.outcome_not_controlled_by_kol
  );
}
