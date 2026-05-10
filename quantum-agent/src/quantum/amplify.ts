// Amplitude amplification: bias the next round's branch sampling toward
// agents that have produced winning conclusions in the past. Backed by
// the `routing` table for cross-session learning.

import { db } from "../memory.ts";

export interface Prior {
  agent: string;
  weight: number;
}

export function priors(intent: string, defaults: string[]): Prior[] {
  const rows = db()
    .prepare(
      "SELECT agent, COUNT(*) AS hits FROM routing WHERE task LIKE ? GROUP BY agent ORDER BY hits DESC LIMIT 10",
    )
    .all(`%${intent}%`) as { agent: string; hits: number }[];

  const weights = new Map<string, number>();
  for (const a of defaults) weights.set(a, 1);
  for (const r of rows) weights.set(r.agent, (weights.get(r.agent) ?? 0) + Math.log1p(r.hits));
  return [...weights.entries()]
    .map(([agent, weight]) => ({ agent, weight }))
    .sort((a, b) => b.weight - a.weight);
}
