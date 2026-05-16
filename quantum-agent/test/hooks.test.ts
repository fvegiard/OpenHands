import { describe, expect, it } from "vitest";
import { evaluatePre } from "../src/hooks.ts";

describe("PreToolUse hook", () => {
  it("hard-denies rm -rf /", () => {
    const r = evaluatePre({ tool_name: "Bash", tool_input: { command: "rm -rf /" } });
    expect(r.decision).toBe("block");
  });
  it("hard-denies force push to main", () => {
    const r = evaluatePre({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
    });
    expect(r.decision).toBe("block");
  });
  it("allows benign commands", () => {
    const r = evaluatePre({ tool_name: "Bash", tool_input: { command: "ls -la" } });
    expect(r.decision).toBe("allow");
  });
});
