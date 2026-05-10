// Superposition: turn a single task into N parallel hypothesis prompts,
// each handled by a different agent / strategy. Collected via the
// blackboard so interference can score them.

import { Blackboard } from "./blackboard.ts";

export interface Hypothesis {
  branch: string;
  prompt: string;
  agent: string;
}

export function prepare(task: string, agents: string[], n = 3): Hypothesis[] {
  const angles = [
    "the most direct, smallest-diff approach",
    "the most defensive approach (test first, fail safely)",
    "the most ambitious approach (refactor adjacent code)",
    "the cheapest approach (no new deps)",
    "the contrarian approach (do the opposite of the obvious)",
  ];
  const out: Hypothesis[] = [];
  for (let i = 0; i < Math.min(n, agents.length, angles.length); i++) {
    const agent = agents[i] ?? "orchestrator";
    out.push({
      branch: `b${i}-${agent}`,
      agent,
      prompt: `${task}\n\nApproach hint: ${angles[i]}.\nWrite your plan, evidence, and a single-line CONCLUSION. Use the blackboard tools.`,
    });
  }
  return out;
}

export function blackboardFor(task: string): Blackboard {
  return new Blackboard(task);
}
