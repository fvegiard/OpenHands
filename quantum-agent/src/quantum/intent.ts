// Lightweight, deterministic intent classifier. Routes a prompt to one of
// the core agent personas. Decisions are persisted to the blackboard for
// `autolearn` to mine.

import { logRouting } from "../memory.ts";

export type Intent = "explore" | "implement" | "review" | "plan" | "fix" | "explain" | "research";

const RULES: { intent: Intent; agent: string; pattern: RegExp }[] = [
  {
    intent: "explore",
    agent: "explorer",
    pattern: /\b(list|show|find|where|what|inspect|summari[sz]e)\b/i,
  },
  {
    intent: "fix",
    agent: "coder",
    pattern: /\b(fix|repair|resolve|debug|broken|fail(ed|ing)?)\b/i,
  },
  {
    intent: "implement",
    agent: "coder",
    pattern: /\b(add|implement|build|create|write|generate)\b/i,
  },
  { intent: "review", agent: "reviewer", pattern: /\b(review|critique|audit|check)\b/i },
  { intent: "plan", agent: "orchestrator", pattern: /\b(plan|design|architect|propose)\b/i },
  { intent: "research", agent: "explorer", pattern: /\b(research|compare|benchmark|how does)\b/i },
  { intent: "explain", agent: "explorer", pattern: /\b(explain|why|how|describe)\b/i },
];

export interface Routing {
  intent: Intent;
  agent: string;
  reason: string;
}

export function classify(prompt: string): Routing {
  for (const r of RULES) {
    if (r.pattern.test(prompt)) {
      const routing: Routing = {
        intent: r.intent,
        agent: r.agent,
        reason: `matched /${r.pattern.source}/`,
      };
      logRouting(prompt.slice(0, 200), routing.agent, routing.reason);
      return routing;
    }
  }
  const fallback: Routing = { intent: "implement", agent: "orchestrator", reason: "default" };
  logRouting(prompt.slice(0, 200), fallback.agent, fallback.reason);
  return fallback;
}
