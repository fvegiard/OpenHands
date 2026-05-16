// Workflow: issue → fix → PR.
// Reads an issue/description from the prompt, drafts a plan, asks the
// agent to implement, runs tests, then prepares a PR. In mock mode every
// step still produces a deterministic summary so flows are testable.

import type { Workflow, WorkflowStep } from "./types.ts";

export const issueToPr: Workflow = async (ctx) => {
  const steps: WorkflowStep[] = [];

  const plan = await ctx.runAgent(
    `Read this issue and propose a minimal implementation plan in 3-5 bullets:\n\n${ctx.prompt}`,
    { noAutoSearch: false },
  );
  steps.push({ step: "plan", ok: !!plan.text, summary: plan.text.slice(0, 200) });

  const implement = await ctx.runAgent(
    `Implement the plan above. Edit only files inside this repo. Report every file you change.\n\nPlan:\n${plan.text}`,
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  steps.push({
    step: "implement",
    ok: !!implement.text,
    summary: implement.text.slice(0, 200),
  });

  const test = await ctx.runAgent(
    "Run the test suite (`pnpm test`) and report pass/fail. If failing, fix and re-run, max 3 tries.",
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  steps.push({ step: "test", ok: !/fail/i.test(test.text), summary: test.text.slice(0, 200) });

  const pr = await ctx.runAgent(
    "Draft a PR title and body (markdown) for the changes you just made. Include a Test Plan section.",
    { resume: ctx.sessionId, noAutoSearch: true },
  );
  steps.push({ step: "pr", ok: !!pr.text, summary: pr.text.slice(0, 200) });

  return {
    workflow: "issue-to-pr",
    steps,
    finalText: pr.text,
    ok: steps.every((s) => s.ok),
  };
};
