// The quantum loop: intent → superpose → entangle → interfere → measure
// → amplify → (tunnel). Pure-functional shell that delegates the
// "execute one branch" step to the supplied runner.

import { priors } from "./amplify.ts";
import { classify } from "./intent.ts";
import { type BranchScore, interfere } from "./interfere.ts";
import { type Measurement, measure } from "./measure.ts";
import { runSequentialThinking, type ThinkingStep } from "./score.ts";
import { blackboardFor, prepare } from "./superpose.ts";
import { contrarianHypothesis, shouldTunnel } from "./tunnel.ts";

export interface BranchOutcome {
  branch: string;
  agent: string;
  conclusion: string;
  score?: number;
}

export type BranchRunner = (h: {
  branch: string;
  agent: string;
  prompt: string;
}) => Promise<BranchOutcome>;

export interface QuantumRunResult {
  routing: ReturnType<typeof classify>;
  scored: BranchScore[];
  measurement: Measurement;
  tunneled: boolean;
}

function formatThought(branch: string, thought: ThinkingStep): string {
  return [
    `[sequential-thinking] branch=${branch} score=${thought.score}/10`,
    `options:\n${thought.options.map((o) => `  - ${o}`).join("\n")}`,
    `risks:\n${thought.risks.map((r) => `  - ${r}`).join("\n")}`,
    `evidence:\n${thought.evidence.map((e) => `  - ${e}`).join("\n")}`,
  ].join("\n");
}

export async function runQuantum(
  task: string,
  run: BranchRunner,
  history: Measurement[] = [],
): Promise<QuantumRunResult> {
  const routing = classify(task);
  const ranked = priors(routing.intent, [routing.agent, "explorer", "coder", "reviewer"]);
  const agents = ranked.map((p) => p.agent);
  const hypotheses = prepare(task, agents, 3);

  const bb = blackboardFor(task);
  await Promise.all(
    hypotheses.map(async (h) => {
      const thought = runSequentialThinking(task, h.branch);
      bb.write(h.branch, "hypothesis", formatThought(h.branch, thought), thought.score);
      const outcome = await run(h);
      bb.write(outcome.branch, "conclusion", outcome.conclusion, outcome.score);
    }),
  );

  let scored = interfere(bb.read());
  let measurement = measure(scored);
  let tunneled = false;

  const decision = shouldTunnel([...history, measurement]);
  if (decision.shouldTunnel && measurement.winner) {
    tunneled = true;
    const tunnelOutcome = await run({
      branch: "b-tunnel",
      agent: "orchestrator",
      prompt: contrarianHypothesis(measurement.winner.conclusions[0] ?? task),
    });
    bb.write(tunnelOutcome.branch, "conclusion", tunnelOutcome.conclusion, tunnelOutcome.score);
    scored = interfere(bb.read());
    measurement = measure(scored);
  }

  return { routing, scored, measurement, tunneled };
}
