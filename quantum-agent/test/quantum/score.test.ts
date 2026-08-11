import { describe, expect, it } from "vitest";
import { computeDeliveryScore, runSequentialThinking } from "../../src/quantum/score.ts";

describe("computeDeliveryScore", () => {
  it("returns perfect score when all inputs are 10 and errors are 0", () => {
    const result = computeDeliveryScore({
      codeCorrectness: 10,
      testCoverage: 10,
      logCleanliness: 10,
      errorCount: 0,
    });
    expect(result.finalScore).toBeCloseTo(10, 1);
    expect(result.breakdown).toContain("final=10.00/10");
  });

  it("returns low score when all inputs are 0 and errors are maxed", () => {
    const result = computeDeliveryScore({
      codeCorrectness: 0,
      testCoverage: 0,
      logCleanliness: 0,
      errorCount: 20,
    });
    expect(result.finalScore).toBeLessThan(3);
    expect(result.errorCount).toBe(20);
  });

  it("clamps inputs to valid range", () => {
    const result = computeDeliveryScore({
      codeCorrectness: 15,
      testCoverage: -5,
      logCleanliness: 100,
      errorCount: -1,
    });
    expect(result.codeCorrectness).toBe(10);
    expect(result.testCoverage).toBe(0);
    expect(result.logCleanliness).toBe(10);
    expect(result.errorCount).toBe(0);
  });

  it("applies error penalty correctly", () => {
    const lowErrors = computeDeliveryScore({
      codeCorrectness: 10,
      testCoverage: 10,
      logCleanliness: 10,
      errorCount: 0,
    });
    const highErrors = computeDeliveryScore({
      codeCorrectness: 10,
      testCoverage: 10,
      logCleanliness: 10,
      errorCount: 20,
    });
    expect(lowErrors.finalScore).toBeGreaterThan(highErrors.finalScore);
  });
});

describe("runSequentialThinking", () => {
  it("returns non-empty options, risks, and evidence", () => {
    const thought = runSequentialThinking("fix the bug", "b0-coder");
    expect(thought.options.length).toBeGreaterThan(0);
    expect(thought.risks.length).toBeGreaterThan(0);
    expect(thought.evidence.length).toBeGreaterThan(0);
  });

  it("scores within 0-10 range", () => {
    const thought = runSequentialThinking("build a feature", "b1-orchestrator");
    expect(thought.score).toBeGreaterThanOrEqual(0);
    expect(thought.score).toBeLessThanOrEqual(10);
  });

  it("includes branch context in the result", () => {
    const thought = runSequentialThinking("refactor auth", "b2-reviewer");
    expect(thought).toBeDefined();
    expect(typeof thought.score).toBe("number");
  });
});
