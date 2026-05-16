// Workflow registry. Stable names → Workflow implementations. CLI's
// `quantum run --workflow <name>` and `quantum workflow run <name>` both
// route through here.

import { bugReproFix } from "./bug-repro-fix.ts";
import { issueToPr } from "./issue-to-pr.ts";
import { prReviewMerge } from "./pr-review-merge.ts";
import { rfcHyperplan } from "./rfc-hyperplan.ts";
import type { Workflow } from "./types.ts";

export const WORKFLOWS: Record<string, { fn: Workflow; description: string }> = {
  "issue-to-pr": {
    fn: issueToPr,
    description: "Read an issue → propose a plan → implement → test → draft PR.",
  },
  "pr-review-merge": {
    fn: prReviewMerge,
    description: "Review a PR diff → produce verdict (MERGE / CHANGES_REQUESTED / BLOCK).",
  },
  "bug-repro-fix": {
    fn: bugReproFix,
    description: "Reproduce a bug with a failing test → fix root cause → verify.",
  },
  "rfc-hyperplan": {
    fn: rfcHyperplan,
    description: "Run 5 hostile critics on a plan before any code is written.",
  },
};

export function listWorkflows(): { name: string; description: string }[] {
  return Object.entries(WORKFLOWS).map(([name, w]) => ({ name, description: w.description }));
}

export function getWorkflow(name: string): Workflow | null {
  return WORKFLOWS[name]?.fn ?? null;
}

export type { Workflow, WorkflowContext, WorkflowResult, WorkflowStep } from "./types.ts";
