import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../src/lib/captcha";

const REAL = "0x4AAAAAAA-not-a-real-secret-for-tests";
const reply = (body: object) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
const expectFaucet = { hostname: "stampd-seven.vercel.app", action: "faucet" };

describe("verifyTurnstile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a token solved on our host for the faucet action", async () => {
    reply({ success: true, hostname: "stampd-seven.vercel.app", action: "faucet" });
    expect(await verifyTurnstile(REAL, "t", "1.2.3.4", expectFaucet)).toBe(true);
  });
  it("rejects a token solved on another site", async () => {
    reply({ success: true, hostname: "evil.example", action: "faucet" });
    expect(await verifyTurnstile(REAL, "t", "1.2.3.4", expectFaucet)).toBe(false);
  });
  it("rejects a token solved for a different action", async () => {
    reply({ success: true, hostname: "stampd-seven.vercel.app", action: "login" });
    expect(await verifyTurnstile(REAL, "t", "1.2.3.4", expectFaucet)).toBe(false);
  });
  it("rejects a failed token", async () => {
    reply({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstile(REAL, "t", "1.2.3.4", expectFaucet)).toBe(false);
  });
  it("skips the hostname check for Cloudflare's dummy test secret (it reports example.com)", async () => {
    reply({ success: true, hostname: "example.com", action: "" });
    expect(await verifyTurnstile("1x0000000000000000000000000000000AA", "t", "1.2.3.4", expectFaucet)).toBe(true);
  });
  it("passes every token without a secret (local dev)", async () => {
    expect(await verifyTurnstile(undefined, "t", "1.2.3.4", expectFaucet)).toBe(true);
  });
});
