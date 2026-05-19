// Quantum tunneling — when the same winning branch keeps winning across
// successive measurements (i.e. we're stuck in a local optimum), inject a
// contrarian "devil's advocate" hypothesis to escape it.

import type { Measurement } from "./measure.ts";

export interface TunnelDecision {
  shouldTunnel: boolean;
  reason: string;
}

export function shouldTunnel(history: Measurement[]): TunnelDecision {
  if (history.length < 2) return { shouldTunnel: false, reason: "not enough history" };
  const last = history[history.length - 1]?.winner?.branch;
  const prev = history[history.length - 2]?.winner?.branch;
  if (!last || !prev) return { shouldTunnel: false, reason: "missing winner" };
  if (last === prev) {
    return { shouldTunnel: true, reason: `same winner twice: ${last}` };
  }
  return { shouldTunnel: false, reason: "diversified" };
}

export function contrarianHypothesis(seed: string): string {
  return `What if the opposite of "${seed}" were true? Argue the contrary case using only evidence from the blackboard.`;
}
