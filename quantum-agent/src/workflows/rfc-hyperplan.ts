// Workflow: RFC → hyperplan critics → implement.
// Runs 5 hostile critics in parallel against a plan before any code is
// written, then proceeds to implementation only if the verdict is positive.

import type { Workflow, WorkflowStep } from "./types.ts";

const CRITICS = ["pessimist", "security", "perf", "maintainability", "scope"] as const;

export const rfcHyperplan: Workflow = async (ctx) => {
  const steps: WorkflowStep[] = [];

  const critiques = await Promise.all(
    CRITICS.map(async (critic) => {
      const r = await ctx.runAgent(
        `You are the "${critic}" critic. Find every flaw in this plan from your angle. ` +
          `Be hostile. List concrete risks.\n\nPlan:\n${ctx.prompt}`,
        { noAutoSearch: true },
      );
      return { critic, text: r.text };
    }),
  );

  for (const c of critiques) {
    steps.push({
      step: `critic:${c.critic}`,
      ok: !!c.text,
      summary: c.text.slice(0, 200),
    });
  }

  const aggregated = critiques.map((c) => `## ${c.critic}\n${c.text}`).join("\n\n");
  const verdict = await ctx.runAgent(
    `Aggregate these 5 hostile critiques into a single ranked risk list. ` +
      `End with: PROCEED / REVISE / ABORT.\n\n${aggregated}`,
    { resume: ctx.sessionId, noAutoSearch: true },
  );

  const ok = /\bPROCEED\b/.test(verdict.text);
  steps.push({ step: "verdict", ok, summary: verdict.text.slice(0, 400) });

  return {
    workflow: "rfc-hyperplan",
    steps,
    finalText: verdict.text,
    ok,
  };
};
