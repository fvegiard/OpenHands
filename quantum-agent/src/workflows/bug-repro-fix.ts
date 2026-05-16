// Workflow: bug → reproduce → fix → test.

import type { Workflow, WorkflowStep } from "./types.ts";

export const bugReproFix: Workflow = async (ctx) => {
  const steps: WorkflowStep[] = [];

  const repro = await ctx.runAgent(
    `Reproduce this bug. Write a failing test that exercises it, then run the test suite to confirm it fails.\n\nBug:\n${ctx.prompt}`,
    { noAutoSearch: false },
  );
  steps.push({ step: "repro", ok: !!repro.text, summary: repro.text.slice(0, 200) });

  const fix = await ctx.runAgent(
    "Fix the bug — root cause, not a band-aid. Keep the change minimal.",
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  steps.push({ step: "fix", ok: !!fix.text, summary: fix.text.slice(0, 200) });

  const verify = await ctx.runAgent(
    "Run the full test suite. Confirm the new test passes and nothing else broke.",
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  steps.push({
    step: "verify",
    ok: !/fail/i.test(verify.text),
    summary: verify.text.slice(0, 200),
  });

  return {
    workflow: "bug-repro-fix",
    steps,
    finalText: verify.text,
    ok: steps.every((s) => s.ok),
  };
};
