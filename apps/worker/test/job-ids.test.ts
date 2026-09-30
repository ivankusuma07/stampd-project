import { describe, expect, it } from "vitest";
import { safeJobId } from "@stampd/queue";

// BullMQ throws "Custom Id cannot contain :" for ids like `draft:<postId>`, which broke AI drafting
// and market creation in production while the unit tests (stand-in queue) passed.
describe("safeJobId", () => {
  it("removes every colon from the natural keys we use", () => {
    for (const key of ["draft:abc", "create:p1", "propose:m1", "submission:s1:retry:1790000000000", "timeline:k1:42", "draft:web:s1"]) {
      expect(safeJobId(key)).not.toContain(":");
    }
  });
  it("is deterministic, so a key still dedupes its job", () => {
    expect(safeJobId("draft:abc")).toBe("draft-abc");
    expect(safeJobId("draft:abc")).toBe(safeJobId("draft:abc"));
  });
});
