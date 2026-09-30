import OpenAI from "openai";
import type { z } from "zod";
import type { XPost } from "@stampd/core";
import { CheckResult, ExtractedClaim } from "./schema";
import { CHECK_SYSTEM, EXTRACT_SYSTEM, checkUser, extractUser } from "./prompts";

/**
 * DeepSeek is the only AI provider (decided 30 Sep 2026, docs/decisions.md D13). Its API is
 * OpenAI-compatible, so the official `openai` SDK is pointed at DeepSeek's base URL.
 */
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-flash";

/**
 * USD per million tokens (api-docs.deepseek.com, checked 30 Sep 2026). Peak hours cost double:
 * 01:00–04:00 and 06:00–10:00 UTC on weekdays. Chinese public holidays (off-peak) are not
 * modelled, so the logged cost is a slight overestimate on those days.
 */
const PRICES: Record<string, { cacheHit: number; cacheMiss: number; output: number }> = {
  "deepseek-flash": { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  "deepseek-v4-flash": { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  "deepseek-v4-pro": { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
};

export function isPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = at.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

export type AiStage = "extract" | "check";

export type AiCallLog = {
  stage: AiStage;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  output: unknown;
  error: string | null;
};

export type ClaimAiOptions = {
  /** injected in tests; otherwise built from `apiKey` */
  client?: Pick<OpenAI, "chat">;
  apiKey?: string;
  model?: string;
  /**
   * DeepSeek thinking mode. Off by default: extraction is a short structured task, and off is
   * faster and cheaper. Set AI_THINKING=enabled to compare on the labelled sample.
   */
  thinking?: "enabled" | "disabled";
  /** Called once per API attempt — write it to the AiCall table. */
  onCall?: (log: AiCallLog) => void | Promise<void>;
  now?: () => Date;
};

/** Hard cap on output per call (plan R24: cap tokens per draft). */
const MAX_OUTPUT_TOKENS = 1500;

export class ClaimAi {
  private readonly client: Pick<OpenAI, "chat">;
  readonly model: string;
  private readonly thinking: "enabled" | "disabled";
  private readonly onCall?: ClaimAiOptions["onCall"];
  private readonly now: () => Date;

  constructor(opts: ClaimAiOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.DEEPSEEK_API_KEY;
    if (!opts.client && !apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
    this.client = opts.client ?? new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL, maxRetries: 2, timeout: 60_000 });
    this.model = opts.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
    this.thinking = opts.thinking ?? (process.env.AI_THINKING === "enabled" ? "enabled" : "disabled");
    this.onCall = opts.onCall;
    this.now = opts.now ?? (() => new Date());
  }

  /** AI pass 1. Returns null if two attempts both fail to produce schema-valid output. */
  extract(post: XPost, now: Date = new Date()): Promise<ExtractedClaim | null> {
    return this.run("extract", ExtractedClaim, EXTRACT_SYSTEM, extractUser(post, now));
  }

  /** AI pass 2: a separate call that checks the draft against the post. */
  check(post: XPost, claim: ExtractedClaim, now: Date = new Date()): Promise<CheckResult | null> {
    return this.run("check", CheckResult, CHECK_SYSTEM, checkUser(post, claim, now));
  }

  private async run<S extends z.ZodType>(
    stage: AiStage,
    schema: S,
    system: string,
    user: string,
  ): Promise<z.infer<S> | null> {
    // JSON mode guarantees valid JSON, not our schema, and DeepSeek documents occasional empty
    // replies — so every answer is validated with Zod and retried once (development plan 4.4).
    // API errors (rate limits, outages) propagate so the job queue retries with backoff.
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      let log: AiCallLog = {
        stage,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        ok: false,
        output: null,
        error: null,
      };
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          // DeepSeek-specific field; the SDK forwards it in the request body.
          thinking: { type: this.thinking },
        } as OpenAI.ChatCompletionCreateParamsNonStreaming);
        log = { ...log, ...this.usage(res.usage), latencyMs: Date.now() - started };

        const choice = res.choices[0];
        const content = choice?.message.content?.trim() ?? "";
        if (choice?.finish_reason === "length") {
          log.error = "max_tokens";
        } else if (choice?.finish_reason === "content_filter") {
          log.error = "content_filter";
        } else if (content === "") {
          log.error = "empty response";
        } else {
          let json: unknown;
          try {
            json = JSON.parse(content);
          } catch {
            json = undefined;
            log.error = "invalid json";
            log.output = content.slice(0, 2000);
          }
          if (json !== undefined) {
            const parsed = schema.safeParse(json);
            if (parsed.success) {
              await this.onCall?.({ ...log, ok: true, output: parsed.data });
              return parsed.data;
            }
            log.error = `schema: ${parsed.error.message.slice(0, 500)}`;
            log.output = json;
          }
        }
      } catch (err) {
        await this.onCall?.({ ...log, latencyMs: Date.now() - started, error: `api: ${(err as Error).message.slice(0, 500)}` });
        throw err;
      }
      await this.onCall?.(log);
    }
    return null;
  }

  private usage(u: OpenAI.CompletionUsage | undefined): Pick<AiCallLog, "inputTokens" | "outputTokens" | "costUsd"> {
    if (!u) return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    // DeepSeek splits prompt tokens into cache hits and misses; fall back to all-miss.
    const extra = u as OpenAI.CompletionUsage & { prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
    const hit = extra.prompt_cache_hit_tokens ?? 0;
    const miss = extra.prompt_cache_miss_tokens ?? u.prompt_tokens - hit;
    const price = PRICES[this.model];
    const factor = isPeak(this.now()) ? 1 : 0.5;
    const costUsd = price ? ((hit * price.cacheHit + miss * price.cacheMiss + u.completion_tokens * price.output) * factor) / 1_000_000 : 0;
    return { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, costUsd };
  }
}
