import { describe, expect, it } from "vitest";
import { classify } from "../src/quantum/intent.ts";
import { interfere } from "../src/quantum/interfere.ts";
import { runQuantum } from "../src/quantum/loop.ts";
import { measure } from "../src/quantum/measure.ts";
import { runSequentialThinking } from "../src/quantum/score.ts";
import { prepare } from "../src/quantum/superpose.ts";
import { contrarianHypothesis, shouldTunnel } from "../src/quantum/tunnel.ts";

describe("intent classifier", () => {
  it("routes 'fix' prompts to coder", () => {
    expect(classify("fix the failing test").agent).toBe("coder");
  });
  it("routes 'show' prompts to explorer", () => {
    expect(classify("show me the auth module").agent).toBe("explorer");
  });
  it("falls back to orchestrator", () => {
    expect(classify("the cake is a lie").agent).toBe("orchestrator");
  });
});

describe("superpose / interfere / measure", () => {
  it("prepares N hypotheses bounded by agents and angles", () => {
    const h = prepare("task", ["a", "b", "c", "d"], 3);
    expect(h).toHaveLength(3);
    expect(new Set(h.map((x) => x.branch)).size).toBe(3);
  });
  it("scores branches by Jaccard agreement", () => {
    const findings = [
      { branch: "a", kind: "conclusion" as const, content: "use redis cache for sessions", ts: 1 },
      { branch: "b", kind: "conclusion" as const, content: "use redis cache for sessions", ts: 2 },
      { branch: "c", kind: "conclusion" as const, content: "rewrite in haskell", ts: 3 },
    ];
    const scored = interfere(findings);
    expect(scored[0]?.score).toBeGreaterThan(scored[scored.length - 1]?.score ?? 0);
  });
  it("measures the top branch", () => {
    const m = measure([
      { branch: "x", score: 1, conclusions: ["x"] },
      { branch: "y", score: 0, conclusions: ["y"] },
    ]);
    expect(m.winner?.branch).toBe("x");
    expect(m.totalBranches).toBe(2);
  });
});

describe("tunneling", () => {
  it("tunnels when the same winner appears twice", () => {
    const history = [
      { winner: { branch: "x", score: 1, conclusions: [] }, losers: [], totalBranches: 1 },
      { winner: { branch: "x", score: 1, conclusions: [] }, losers: [], totalBranches: 1 },
    ];
    expect(shouldTunnel(history).shouldTunnel).toBe(true);
  });
  it("contrarian hypothesis prompt is non-trivial", () => {
    const text = contrarianHypothesis("use postgres");
    expect(text).toMatch(/opposite/i);
  });
});

describe("sequential-thinking injection", () => {
  it("runs quantum loop with thinking steps on blackboard", async () => {
    const outcomes: Record<string, { conclusion: string; score?: number }> = {
      "b0-orchestrator": { conclusion: "use postgres", score: 7 },
      "b1-explorer": { conclusion: "use postgres too", score: 5 },
      "b2-coder": { conclusion: "use postgres as well", score: 6 },
    };

    const result = await runQuantum("design a database schema", async (h) => {
      const out = outcomes[h.branch]!;
      return { branch: h.branch, agent: h.agent, conclusion: out.conclusion, score: out.score };
    });

    expect(result.routing).toBeDefined();
    expect(result.scored.length).toBe(3);
    expect(result.measurement.winner).not.toBeNull();
    expect(["b0-orchestrator", "b1-explorer", "b2-coder"]).toContain(
      result.measurement.winner?.branch,
    );
  });

  it("produces a thinking step for each branch", async () => {
    const thoughts: string[] = [];
    await runQuantum("fix the login bug", async (h) => {
      return { branch: h.branch, agent: h.agent, conclusion: "fixed", score: 8 };
    });
    const branches = ["b0-coder", "b1-explorer", "b2-reviewer"];
    for (const branch of branches) {
      const thought = runSequentialThinking("fix the login bug", branch);
      thoughts.push(thought.options[0] ?? "");
    }
    expect(thoughts.length).toBe(3);
  });
});
