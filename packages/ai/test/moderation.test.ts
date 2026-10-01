import { describe, expect, it } from "vitest";
import type { XPost } from "@stampd/core";
import {
  prefilter,
  validateClaim,
  routeDraft,
  buildSpec,
  ClaimAi,
  type ExtractedClaim,
  type CheckResult,
  type ValidatorCode,
  type AiCallLog,
  type ClaimAiOptions,
} from "../src";

const now = new Date("2026-09-30T00:00:00Z");

const post: XPost = {
  id: "1873000000000000000",
  authorId: "42",
  authorHandle: "example_kol",
  text: "BTC will close above $90k before end of March. Mark my words.",
  createdAt: "2026-09-29T12:00:00Z",
  url: "https://x.com/example_kol/status/1873000000000000000",
};

const good: ExtractedClaim = {
  is_prediction: true,
  subject: "BTC",
  metric: "daily close",
  comparator: ">=",
  threshold: "90000",
  deadline_utc: "2027-03-31T23:59:59Z",
  resolution_source: "coinbase-daily-close",
  question: "Will BTC have a Coinbase daily close at or above $90,000 before 31 Mar 2027?",
  rules: "Resolves YES if any Coinbase BTC-USD daily close (UTC) from market open to 31 Mar 2027 23:59:59 UTC is >= 90000.",
  category: "crypto",
  kol_side: "YES",
  outcome_controlled_by_kol: false,
  confidence: 0.95,
  notes: "dated price target",
};

const approve: CheckResult = {
  real_prediction: true,
  question_matches_post: true,
  resolvable_from_source: true,
  neutral_wording: true,
  outcome_not_controlled_by_kol: true,
  verdict: "approve",
  notes: "",
};

const ctx = { now, kolExcluded: false, isDuplicate: false };

describe("prefilter (development plan 4.3)", () => {
  it("keeps a dated price call", () => {
    expect(prefilter(post)).toEqual({ keep: true });
    expect(prefilter({ text: "ETH to 10k by EOY" })).toEqual({ keep: true });
    expect(prefilter({ text: "SOL flips $300 in Q2, calling it now" })).toEqual({ keep: true });
  });
  it("drops replies and reposts", () => {
    expect(prefilter({ ...post, replyToId: "1" })).toEqual({ keep: false, reason: "reply" });
    expect(prefilter({ ...post, isRepost: true })).toEqual({ keep: false, reason: "repost" });
    expect(prefilter({ text: "RT @someone: BTC will hit 100k" })).toEqual({ keep: false, reason: "repost" });
  });
  it("drops posts with no forward-looking words or no numbers", () => {
    expect(prefilter({ text: "gm frens, great vibes today" })).toEqual({ keep: false, reason: "no-forward" });
    expect(prefilter({ text: "BTC will go up, trust me" })).toEqual({ keep: false, reason: "no-number" });
  });
  it("ignores numbers that only appear inside links", () => {
    expect(prefilter({ text: "we will see https://t.co/abc123456" })).toEqual({ keep: false, reason: "no-number" });
  });
});

describe("validators (development plan 4.5)", () => {
  it("a clean draft passes every validator", () => {
    expect(validateClaim(good, ctx).errors).toEqual([]);
  });

  const failing: [ValidatorCode, Partial<ExtractedClaim>, Partial<typeof ctx>][] = [
    ["NOT_PREDICTION", { is_prediction: false }, {}],
    ["DEADLINE_MISSING", { deadline_utc: "" }, {}],
    ["DEADLINE_INVALID", { deadline_utc: "end of march" }, {}],
    ["DEADLINE_PAST", { deadline_utc: "2026-09-30T12:00:00Z" }, {}],
    ["DEADLINE_TOO_FAR", { deadline_utc: "2027-12-31T00:00:00Z" }, {}],
    ["DUPLICATE", {}, { isDuplicate: true }],
    ["KOL_EXCLUDED", {}, { kolExcluded: true }],
    ["SOURCE_NOT_ALLOWED", { resolution_source: "some-blog" }, {}],
    ["ASSET_NOT_ALLOWED", { subject: "PEPE" }, {}],
    ["THRESHOLD_NOT_NUMERIC", { threshold: "$90k" }, {}],
    ["KOL_CONTROLS_OUTCOME", { outcome_controlled_by_kol: true }, {}],
  ];

  for (const [code, claimPatch, ctxPatch] of failing) {
    it(`fails ${code}`, () => {
      const r = validateClaim({ ...good, ...claimPatch }, { ...ctx, ...ctxPatch });
      expect(r.errors).toContain(code);
    });
  }

  it("splits hard and soft failures", () => {
    const r = validateClaim({ ...good, deadline_utc: "", subject: "PEPE" }, ctx);
    expect(r.hard).toEqual(["DEADLINE_MISSING"]);
    expect(r.soft).toEqual(["ASSET_NOT_ALLOWED"]);
  });
});

describe("routing (plan B10a)", () => {
  const none = new Set<never>();
  const all = new Set(["crypto-major-daily-close"] as const);

  it("reviews everything while templates are off, but logs the AI decision", () => {
    const d = routeDraft({ claim: good, check: approve, validation: validateClaim(good, ctx), enabledTemplates: none });
    expect(d.route).toBe("REVIEW");
    expect(d.aiDecision).toBe("AUTO_PUBLISH");
  });

  it("auto-publishes an enabled template when both passes agree", () => {
    const d = routeDraft({ claim: good, check: approve, validation: validateClaim(good, ctx), enabledTemplates: all });
    expect(d.route).toBe("AUTO_PUBLISH");
    expect(d.template).toBe("crypto-major-daily-close");
  });

  it("sends disagreement to review", () => {
    const check = { ...approve, neutral_wording: false, verdict: "review" as const };
    const d = routeDraft({ claim: good, check, validation: validateClaim(good, ctx), enabledTemplates: all });
    expect(d.route).toBe("REVIEW");
  });

  it("auto-publishes at the owner's 0.75 confidence bar (D16) and not below it", () => {
    const sure = { ...good, confidence: 0.8 };
    expect(routeDraft({ claim: sure, check: approve, validation: validateClaim(sure, ctx), enabledTemplates: all }).route).toBe("AUTO_PUBLISH");
    const unsure = { ...good, confidence: 0.7 };
    const d = routeDraft({ claim: unsure, check: approve, validation: validateClaim(unsure, ctx), enabledTemplates: all });
    expect(d.route).toBe("REVIEW");
    expect(d.reasons.join(" ")).toMatch(/confidence 0.7 < 0.75/);
  });

  it("sends off-allowlist claims (e.g. politics) to review, not rejection", () => {
    const claim: ExtractedClaim = { ...good, category: "politics", subject: "ELECTION", resolution_source: "" };
    const d = routeDraft({ claim, check: approve, validation: validateClaim(claim, ctx), enabledTemplates: all });
    expect(d.route).toBe("REVIEW");
    expect(d.reasons).toContain("SOURCE_NOT_ALLOWED");
  });

  it("auto-rejects hard validator failures", () => {
    const claim = { ...good, deadline_utc: "" };
    const d = routeDraft({ claim, check: approve, validation: validateClaim(claim, ctx), enabledTemplates: all });
    expect(d.route).toBe("AUTO_REJECT");
  });

  it("auto-rejects only when both passes say it is not a prediction", () => {
    const claim = { ...good, is_prediction: false, confidence: 0.9 };
    const v = { ...validateClaim(claim, ctx), hard: [] }; // isolate the AI-agreement rule
    const reject = { ...approve, real_prediction: false, verdict: "reject" as const };
    expect(routeDraft({ claim, check: reject, validation: v, enabledTemplates: all }).route).toBe("AUTO_REJECT");
    expect(routeDraft({ claim, check: approve, validation: v, enabledTemplates: all }).route).toBe("REVIEW");
  });
});

describe("buildSpec", () => {
  it("closes at the deadline and gives the resolver one day", () => {
    const spec = buildSpec(good, post, new Date(good.deadline_utc));
    expect(spec.closeTime).toBe("2027-03-31T23:59:59.000Z");
    expect(spec.resolveBy).toBe("2027-04-01T23:59:59.000Z");
    expect(spec.resolution.subject).toBe("BTC");
    expect(spec.kolHandle).toBe("example_kol");
  });
});

describe("ClaimAi on DeepSeek (development plan 4.4)", () => {
  type Sent = Record<string, unknown>;
  function fakeClient(responses: unknown[], sent: Sent[] = []) {
    let i = 0;
    return {
      chat: {
        completions: {
          create: async (body: Sent) => {
            sent.push(body);
            return responses[i++];
          },
        },
      },
    } as unknown as NonNullable<ClaimAiOptions["client"]>;
  }
  const usage = { prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 400, prompt_cache_miss_tokens: 600 };
  const reply = (content: string, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { content } }], usage });
  const offPeak = () => new Date("2026-09-30T12:00:00Z"); // Wednesday 12:00 UTC
  const peak = () => new Date("2026-09-30T02:00:00Z"); // Wednesday 02:00 UTC

  it("asks for JSON output with thinking off by default", async () => {
    const sent: Sent[] = [];
    const ai = new ClaimAi({ client: fakeClient([reply(JSON.stringify(good))], sent), now: offPeak });
    expect(await ai.extract(post, now)).toEqual(good);
    expect(sent[0]).toMatchObject({ model: "deepseek-flash", response_format: { type: "json_object" }, thinking: { type: "disabled" } });
    const system = (sent[0]!.messages as { content: string }[])[0]!.content;
    expect(system).toContain("json"); // DeepSeek's JSON mode requires the word and an example
  });

  it("retries once on schema-invalid output, then succeeds, logging both calls with cost", async () => {
    const logs: AiCallLog[] = [];
    const ai = new ClaimAi({
      onCall: (l) => void logs.push(l),
      now: offPeak,
      client: fakeClient([reply(JSON.stringify({ is_prediction: "yes" })), reply(JSON.stringify(good))]),
    });
    expect(await ai.extract(post, now)).toEqual(good);
    expect(logs.map((l) => l.ok)).toEqual([false, true]);
    // off-peak = half the peak price: (400·0.006 + 600·0.30 + 200·1.20) / 2 per million
    expect(logs[1]!.costUsd).toBeCloseTo((400 * 0.006 + 600 * 0.3 + 200 * 1.2) / 2 / 1e6, 12);
  });

  it("charges peak rates in peak hours", async () => {
    const logs: AiCallLog[] = [];
    const ai = new ClaimAi({ onCall: (l) => void logs.push(l), now: peak, client: fakeClient([reply(JSON.stringify(good))]) });
    await ai.extract(post, now);
    expect(logs[0]!.costUsd).toBeCloseTo((400 * 0.006 + 600 * 0.3 + 200 * 1.2) / 1e6, 12);
  });

  it("returns null after two bad attempts (empty reply, truncated)", async () => {
    const logs: AiCallLog[] = [];
    const ai = new ClaimAi({
      onCall: (l) => void logs.push(l),
      client: fakeClient([reply(""), reply('{"is_pred', "length")]),
    });
    expect(await ai.extract(post, now)).toBeNull();
    expect(logs.map((l) => l.error)).toEqual(["empty response", "max_tokens"]);
  });

  it("treats non-JSON text as a failed attempt", async () => {
    const logs: AiCallLog[] = [];
    const ai = new ClaimAi({ onCall: (l) => void logs.push(l), client: fakeClient([reply("Sure! Here you go"), reply(JSON.stringify(good))]) });
    expect(await ai.extract(post, now)).toEqual(good);
    expect(logs[0]!.error).toBe("invalid json");
  });

  it("refuses to start without an API key", () => {
    const saved = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    expect(() => new ClaimAi()).toThrow("DEEPSEEK_API_KEY is not set");
    if (saved) process.env.DEEPSEEK_API_KEY = saved;
  });
});
