// Collapse: pick the highest-scoring branch and return it as the committed
// answer. The caller (`interfere`) returns branches sorted by score
// descending; in case of a score tie we break by recency (most recent ts
// wins), then by length of the first conclusion as a final stable tiebreak.

import type { BranchScore } from "./interfere.ts";

export interface Measurement {
  winner: BranchScore | null;
  losers: BranchScore[];
  totalBranches: number;
}

function tieBreak(a: BranchScore, b: BranchScore): number {
  if (a.score !== b.score) return b.score - a.score;
  // Newer wins.
  const aTs = a.lastTs ?? 0;
  const bTs = b.lastTs ?? 0;
  if (aTs !== bTs) return bTs - aTs;
  // Longer (more substantive) conclusion wins.
  const aLen = a.conclusions[0]?.length ?? 0;
  const bLen = b.conclusions[0]?.length ?? 0;
  return bLen - aLen;
}

export function measure(scored: BranchScore[]): Measurement {
  if (scored.length === 0) return { winner: null, losers: [], totalBranches: 0 };
  const sorted = [...scored].sort(tieBreak);
  const [winner, ...losers] = sorted;
  return { winner: winner ?? null, losers, totalBranches: sorted.length };
}
