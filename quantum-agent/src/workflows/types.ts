// Workflow types. A workflow is a deterministic orchestration that calls
// runAgent in a sequence with structured prompts and records each step's
// outcome to the entangled blackboard.

import type { RunResult } from "../agent.ts";

export interface WorkflowContext {
  prompt: string;
  runAgent: (p: string, opts?: { resume?: string; noAutoSearch?: boolean }) => Promise<RunResult>;
  sessionId: string;
}

export interface WorkflowStep {
  step: string;
  ok: boolean;
  summary: string;
}

export interface WorkflowResult {
  workflow: string;
  steps: WorkflowStep[];
  finalText: string;
  ok: boolean;
}

export type Workflow = (ctx: WorkflowContext) => Promise<WorkflowResult>;
