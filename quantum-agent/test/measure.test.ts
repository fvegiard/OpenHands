// Verifies the documented tie-break: on equal scores, prefer the more
// recent finding (`lastTs`); then prefer the longer first conclusion.

import { describe, expect, it } from "vitest";
import type { BranchScore } from "../src/quantum/interfere.ts";
import { measure } from "../src/quantum/measure.ts";

describe("measure tie-break", () => {
  it("score is the primary key (descending)", () => {
    const scored: BranchScore[] = [
      { branch: "a", score: 1, conclusions: ["a"] },
      { branch: "b", score: 9, conclusions: ["b"] },
    ];
    const m = measure(scored);
    expect(m.winner?.branch).toBe("b");
  });

  it("equal scores → newer ts wins", () => {
    const scored: BranchScore[] = [
      { branch: "old", score: 5, conclusions: ["x"], lastTs: 1_000 },
      { branch: "new", score: 5, conclusions: ["x"], lastTs: 2_000 },
    ];
    const m = measure(scored);
    expect(m.winner?.branch).toBe("new");
  });

  it("equal score + ts → longer first conclusion wins", () => {
    const scored: BranchScore[] = [
      { branch: "short", score: 5, conclusions: ["a"], lastTs: 1_000 },
      { branch: "long", score: 5, conclusions: ["a much longer conclusion"], lastTs: 1_000 },
    ];
    const m = measure(scored);
    expect(m.winner?.branch).toBe("long");
  });

  it("empty input returns null winner", () => {
    const m = measure([]);
    expect(m.winner).toBeNull();
    expect(m.totalBranches).toBe(0);
  });
});
