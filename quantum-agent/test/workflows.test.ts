import { describe, expect, it } from "vitest";
import type { RunOptions, RunResult } from "../src/agent.ts";
import { getWorkflow, listWorkflows } from "../src/workflows/index.ts";

const FAKE_AUTH = "mock" as const;

function fakeRunner(canned: Record<string, string> = {}) {
  return async (prompt: string, opts: RunOptions = {}): Promise<RunResult> => {
    const key = Object.keys(canned).find((k) => prompt.toLowerCase().includes(k));
    const text = key ? canned[key] : `[stub] ${prompt.slice(0, 80)}`;
    return {
      text: text ?? "",
      sessionId: opts.resume ?? "s-1",
      auth: FAKE_AUTH,
      mock: true,
    };
  };
}

describe("workflows", () => {
  it("registry exposes 4 named flows", () => {
    const names = listWorkflows().map((w) => w.name);
    expect(names).toContain("issue-to-pr");
    expect(names).toContain("pr-review-merge");
    expect(names).toContain("bug-repro-fix");
    expect(names).toContain("rfc-hyperplan");
  });

  it("getWorkflow returns null for unknown name", () => {
    expect(getWorkflow("nope")).toBeNull();
  });

  it("issue-to-pr produces 4 steps in order", async () => {
    const wf = getWorkflow("issue-to-pr");
    const r = await wf!({ prompt: "fix login redirect", sessionId: "s-1", runAgent: fakeRunner() });
    expect(r.workflow).toBe("issue-to-pr");
    expect(r.steps.map((s) => s.step)).toEqual(["plan", "implement", "test", "pr"]);
  });

  it("pr-review-merge declares MERGE on a clean review", async () => {
    const wf = getWorkflow("pr-review-merge");
    const r = await wf!({
      prompt: "diff: trivial typo fix",
      sessionId: "s-2",
      runAgent: fakeRunner({ "exactly one": "MERGE — looks good." }),
    });
    expect(r.ok).toBe(true);
    expect(r.finalText).toContain("MERGE");
  });

  it("pr-review-merge marks CHANGES_REQUESTED as not-ok", async () => {
    const wf = getWorkflow("pr-review-merge");
    const r = await wf!({
      prompt: "diff: leaks API key",
      sessionId: "s-3",
      runAgent: fakeRunner({ "exactly one": "CHANGES_REQUESTED — secret in plaintext." }),
    });
    expect(r.ok).toBe(false);
  });

  it("rfc-hyperplan fans out 5 critics and reports a verdict", async () => {
    const wf = getWorkflow("rfc-hyperplan");
    const r = await wf!({
      prompt: "Rewrite auth in 1 week",
      sessionId: "s-4",
      runAgent: fakeRunner({ aggregate: "PROCEED with caveats." }),
    });
    const critics = r.steps.filter((s) => s.step.startsWith("critic:"));
    expect(critics.length).toBe(5);
    expect(r.ok).toBe(true);
  });

  it("bug-repro-fix marks verify failure", async () => {
    const wf = getWorkflow("bug-repro-fix");
    const r = await wf!({
      prompt: "crash on empty input",
      sessionId: "s-5",
      runAgent: fakeRunner({ "run the full test": "1 test failed: AssertionError" }),
    });
    const verify = r.steps.find((s) => s.step === "verify");
    expect(verify?.ok).toBe(false);
    expect(r.ok).toBe(false);
  });
});
