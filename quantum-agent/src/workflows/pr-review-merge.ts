// Workflow: PR → review → merge.
// Pulls a PR's diff, runs the reviewer agent, decides merge readiness.

import type { Workflow, WorkflowStep } from "./types.ts";

export const prReviewMerge: Workflow = async (ctx) => {
  const steps: WorkflowStep[] = [];

  const review = await ctx.runAgent(
    `Review the following PR description / diff for correctness, security, perf, and style. ` +
      `Output a structured report with one section per concern.\n\n${ctx.prompt}`,
    { noAutoSearch: false },
  );
  steps.push({ step: "review", ok: !!review.text, summary: review.text.slice(0, 200) });

  const verdict = await ctx.runAgent(
    "Based on the review above, output exactly one of: MERGE / CHANGES_REQUESTED / BLOCK. " +
      "Then one sentence of justification.",
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  const v = verdict.text.toUpperCase();
  const ok = v.includes("MERGE") && !v.includes("CHANGES_REQUESTED") && !v.includes("BLOCK");
  steps.push({ step: "verdict", ok, summary: verdict.text.slice(0, 200) });

  return {
    workflow: "pr-review-merge",
    steps,
    finalText: verdict.text,
    ok,
  };
};
