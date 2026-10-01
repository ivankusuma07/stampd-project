import { describe, expect, it } from "vitest";
import { plainDashes } from "../src/spec";

// Owner's style rule: market questions and rules never show an em dash.
describe("plainDashes", () => {
  it("turns a spaced em dash into a comma", () => {
    expect(plainDashes("Resolves YES if BTC closes above $90,000 — otherwise NO.")).toBe(
      "Resolves YES if BTC closes above $90,000, otherwise NO.",
    );
  });
  it("turns an em dash between words into a hyphen", () => {
    expect(plainDashes("a mid—cycle top")).toBe("a mid-cycle top");
  });
  it("leaves text without em dashes alone and never doubles commas", () => {
    expect(plainDashes("Will ETH close at or above $5,000 before 31 Dec 2026?")).toBe("Will ETH close at or above $5,000 before 31 Dec 2026?");
    expect(plainDashes("one, — two")).toBe("one, two");
    expect(plainDashes("a — b")).not.toMatch(/—/);
  });
});
