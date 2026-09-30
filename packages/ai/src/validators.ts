import type { ExtractedClaim } from "./schema";
import { sourceFor, type TemplateId } from "./allowlist";

/**
 * Code validators (plan B10a step 1, development plan 4.5). Not AI.
 *
 * Two kinds of failure:
 *  - HARD: the draft can never become a market → auto-reject.
 *  - SOFT: outside the allowlists (e.g. politics, a stock, a low-cap token) → a human decides.
 *    The plan routes "politics, sports, tech, company or people claims" to review, so an
 *    allowlist miss cannot be an automatic rejection. See docs/decisions.md (D3).
 */
export type ValidatorCode =
  | "NOT_PREDICTION"
  | "DEADLINE_MISSING"
  | "DEADLINE_INVALID"
  | "DEADLINE_PAST"
  | "DEADLINE_TOO_FAR"
  | "DUPLICATE"
  | "KOL_EXCLUDED"
  | "SOURCE_NOT_ALLOWED"
  | "ASSET_NOT_ALLOWED"
  | "THRESHOLD_NOT_NUMERIC"
  | "KOL_CONTROLS_OUTCOME";

export const HARD: ReadonlySet<ValidatorCode> = new Set([
  "NOT_PREDICTION",
  "DEADLINE_MISSING",
  "DEADLINE_INVALID",
  "DEADLINE_PAST",
  "DEADLINE_TOO_FAR",
  "DUPLICATE",
  "KOL_EXCLUDED",
]);

export const MAX_HORIZON_DAYS = 365;
/** Markets need time to trade: the deadline must be at least this far out. */
export const MIN_HORIZON_HOURS = 24;

export type ValidationContext = {
  now: Date;
  kolExcluded: boolean;
  isDuplicate: boolean;
};

export type ValidationResult = {
  errors: ValidatorCode[];
  hard: ValidatorCode[];
  soft: ValidatorCode[];
  deadline: Date | null;
};

export function validateClaim(c: ExtractedClaim, ctx: ValidationContext): ValidationResult {
  const errors: ValidatorCode[] = [];
  if (!c.is_prediction) errors.push("NOT_PREDICTION");

  let deadline: Date | null = null;
  if (c.deadline_utc.trim() === "") {
    errors.push("DEADLINE_MISSING");
  } else {
    const d = new Date(c.deadline_utc);
    if (Number.isNaN(d.getTime())) {
      errors.push("DEADLINE_INVALID");
    } else {
      deadline = d;
      const ms = d.getTime() - ctx.now.getTime();
      if (ms < MIN_HORIZON_HOURS * 3_600_000) errors.push("DEADLINE_PAST");
      else if (ms > MAX_HORIZON_DAYS * 86_400_000) errors.push("DEADLINE_TOO_FAR");
    }
  }

  if (ctx.isDuplicate) errors.push("DUPLICATE");
  if (ctx.kolExcluded) errors.push("KOL_EXCLUDED");

  const source = sourceFor(c.resolution_source);
  if (!source) errors.push("SOURCE_NOT_ALLOWED");
  else if (!(c.subject.toUpperCase() in source.assets)) errors.push("ASSET_NOT_ALLOWED");

  if (!/^\d+(\.\d+)?$/.test(c.threshold.trim()) || Number(c.threshold) <= 0) errors.push("THRESHOLD_NOT_NUMERIC");
  if (c.outcome_controlled_by_kol) errors.push("KOL_CONTROLS_OUTCOME");

  return {
    errors,
    hard: errors.filter((e) => HARD.has(e)),
    soft: errors.filter((e) => !HARD.has(e)),
    deadline,
  };
}

/** Which auto-publish template, if any, a clean draft fits. */
export function matchTemplate(c: ExtractedClaim, v: ValidationResult): TemplateId | null {
  if (v.errors.length > 0) return null;
  if (c.category !== "crypto") return null;
  if (c.metric.trim().toLowerCase() !== "daily close") return null;
  return "crypto-major-daily-close";
}

export const VALIDATOR_MESSAGES: Record<ValidatorCode, string> = {
  NOT_PREDICTION: "not a checkable prediction",
  DEADLINE_MISSING: "the post gives no deadline",
  DEADLINE_INVALID: "the deadline could not be read",
  DEADLINE_PAST: `the deadline is in the past or less than ${MIN_HORIZON_HOURS}h away`,
  DEADLINE_TOO_FAR: `the deadline is more than ${MAX_HORIZON_DAYS} days away`,
  DUPLICATE: "a market for this call already exists",
  KOL_EXCLUDED: "this account asked not to be listed",
  SOURCE_NOT_ALLOWED: "no allowlisted data source can settle it",
  ASSET_NOT_ALLOWED: "the asset is not on the allowlist",
  THRESHOLD_NOT_NUMERIC: "no numeric threshold",
  KOL_CONTROLS_OUTCOME: "the author controls the outcome",
};
