import type { CheckResult, ExtractedClaim } from "./schema";
import { checklistPasses } from "./schema";
import type { TemplateId } from "./allowlist";
import { matchTemplate, type ValidationResult } from "./validators";

/**
 * Moderation routing (plan B10a step 3):
 *  - AUTO_REJECT: a hard validator failed, or both AI passes agree it isn't a prediction.
 *  - AUTO_PUBLISH: everything clean, both passes agree with high confidence, the draft fits a
 *    template AND that template has been switched on. All templates are off at launch.
 *  - REVIEW: everything else.
 * `aiDecision` is what routing would do with every template on; it is logged beside the human
 * decision to measure agreement before enabling a template.
 */
export type Route = "AUTO_PUBLISH" | "REVIEW" | "AUTO_REJECT";

export const AUTO_PUBLISH_MIN_CONFIDENCE = 0.9;
export const AUTO_REJECT_MIN_CONFIDENCE = 0.8;

export type RoutingInput = {
  claim: ExtractedClaim;
  check: CheckResult | null;
  validation: ValidationResult;
  enabledTemplates: ReadonlySet<TemplateId>;
};

export type RoutingDecision = {
  route: Route;
  aiDecision: Route;
  template: TemplateId | null;
  reasons: string[];
};

export function routeDraft({ claim, check, validation, enabledTemplates }: RoutingInput): RoutingDecision {
  const reasons: string[] = [];

  if (validation.hard.length > 0) {
    reasons.push(...validation.hard);
    return { route: "AUTO_REJECT", aiDecision: "AUTO_REJECT", template: null, reasons };
  }

  const bothSayNotPrediction =
    !claim.is_prediction && check !== null && !check.real_prediction && claim.confidence >= AUTO_REJECT_MIN_CONFIDENCE;
  if (bothSayNotPrediction) {
    reasons.push("both AI passes: not a prediction");
    return { route: "AUTO_REJECT", aiDecision: "AUTO_REJECT", template: null, reasons };
  }

  const template = matchTemplate(claim, validation);
  const agree =
    check !== null &&
    check.verdict === "approve" &&
    checklistPasses(check) &&
    claim.confidence >= AUTO_PUBLISH_MIN_CONFIDENCE;

  const aiDecision: Route = template && agree ? "AUTO_PUBLISH" : "REVIEW";
  if (validation.soft.length > 0) reasons.push(...validation.soft);
  if (!check) reasons.push("check pass missing");
  else if (check.verdict !== "approve" || !checklistPasses(check)) reasons.push(`check verdict: ${check.verdict}`);
  else if (claim.confidence < AUTO_PUBLISH_MIN_CONFIDENCE) {
    reasons.push(`extraction confidence ${claim.confidence} < ${AUTO_PUBLISH_MIN_CONFIDENCE}`);
  }
  if (!template) reasons.push("no auto-publish template");

  if (aiDecision === "AUTO_PUBLISH" && template && enabledTemplates.has(template)) {
    return { route: "AUTO_PUBLISH", aiDecision, template, reasons: [] };
  }
  if (aiDecision === "AUTO_PUBLISH") reasons.push(`template ${template} not enabled`);
  return { route: "REVIEW", aiDecision, template, reasons };
}
