// Collapse: pick the highest-scoring branch and return it as the committed
// answer. Ties are broken by recency, then by length of conclusion.

import type { BranchScore } from "./interfere.ts";

export interface Measurement {
  winner: BranchScore | null;
  losers: BranchScore[];
  totalBranches: number;
}

export function measure(scored: BranchScore[]): Measurement {
  if (scored.length === 0) return { winner: null, losers: [], totalBranches: 0 };
  const [winner, ...losers] = scored;
  return { winner: winner ?? null, losers, totalBranches: scored.length };
}
