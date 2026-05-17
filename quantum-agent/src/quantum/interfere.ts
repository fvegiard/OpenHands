// Interference: score parallel branches, reinforce agreement, cancel
// contradiction. Returns a ranked list ready for measurement.

import type { Finding } from "./blackboard.ts";

export interface BranchScore {
  branch: string;
  score: number;
  conclusions: string[];
  /** Most recent timestamp across this branch's findings (ms since epoch). */
  lastTs?: number;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function interfere(findings: Finding[]): BranchScore[] {
  const byBranch = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byBranch.get(f.branch) ?? [];
    list.push(f);
    byBranch.set(f.branch, list);
  }

  const conclusions: { branch: string; text: string; vec: Set<string> }[] = [];
  for (const [branch, fs] of byBranch) {
    for (const f of fs) {
      if (f.kind === "conclusion") {
        conclusions.push({ branch, text: f.content, vec: tokenize(f.content) });
      }
    }
  }

  const scoreMap = new Map<string, number>();
  for (let i = 0; i < conclusions.length; i++) {
    let agreement = 0;
    const a = conclusions[i]!;
    for (let j = 0; j < conclusions.length; j++) {
      if (i === j) continue;
      agreement += jaccard(a.vec, conclusions[j]!.vec);
    }
    scoreMap.set(a.branch, (scoreMap.get(a.branch) ?? 0) + agreement);
  }

  // Add explicit scores written via `bb.write(branch, "score", "...", n)`.
  for (const f of findings) {
    if (f.kind === "score" && typeof f.score === "number") {
      scoreMap.set(f.branch, (scoreMap.get(f.branch) ?? 0) + f.score);
    }
  }

  return [...byBranch.keys()]
    .map((branch) => {
      const branchFindings = byBranch.get(branch) ?? [];
      const lastTs = branchFindings.reduce((max, f) => (f.ts > max ? f.ts : max), 0);
      return {
        branch,
        score: scoreMap.get(branch) ?? 0,
        conclusions: conclusions.filter((c) => c.branch === branch).map((c) => c.text),
        lastTs,
      };
    })
    .sort((a, b) => b.score - a.score);
}
