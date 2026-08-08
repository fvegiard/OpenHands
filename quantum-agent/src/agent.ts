// Agent core — wraps the official `query()` from @anthropic-ai/claude-agent-sdk.
// Falls back to a deterministic mock transport when no auth is available so
// the build always proceeds (one-shot delivery contract).

import { randomUUID } from "node:crypto";
import { type AuthResult, resolveAuth } from "./auth.ts";
import { appendTranscript, touchSession } from "./memory.ts";
import { resolveRuntimeConfig } from "./providers/registry.ts";
import { classify } from "./quantum/intent.ts";
import { type BranchOutcome, runQuantum } from "./quantum/loop.ts";
import { reflect } from "./quantum/reflect.ts";
import { getAdapter } from "./runtimes/index.ts";
import { loadSkillByName } from "./skills/manager.ts";
import { autoWebSearch } from "./tools/web.ts";
import { getWorkflow } from "./workflows/index.ts";

export interface RunOptions {
  resume?: string;
  model?: string;
  quantum?: boolean;
  speak?: boolean;
  workflow?: string;
  skill?: string;
  signal?: AbortSignal;
  maxBudgetUsd?: number;
  /** Skip the pre-flight autoWebSearch (used by recursive quantum calls). */
  noAutoSearch?: boolean;
}

export interface RunResult {
  text: string;
  sessionId: string;
  auth: AuthResult["mode"];
  mock: boolean;
}

/**
 * Generate a collision-resistant session id. `--quantum` runs spawn branches
 * in parallel; a bare `Date.now()` collides under that load, so we add a
 * random UUID suffix.
 */
export function newSessionId(): string {
  return `q-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export async function runAgent(prompt: string, opts: RunOptions = {}): Promise<RunResult> {
  const auth = resolveAuth();
  // Resolve the selected runtime and its adapter. Selecting a non-Claude
  // runtime changes the execution path; an explicitly selected but unavailable
  // runtime fails fast with a precise diagnostic (no silent fallback).
  const runtimeConfig = resolveRuntimeConfig();
  const adapter = getAdapter(runtimeConfig.runtime);
  const availability = await adapter.available();
  if (runtimeConfig.runtime !== "claude" && !availability.ok) {
    throw new Error(
      `Selected runtime '${runtimeConfig.runtime}' is unavailable and Quantum does not fall back: ` +
        `${availability.reason}.`,
    );
  }
  // The Claude runtime uses a mock transport only when no credential is present.
  const willMock = runtimeConfig.runtime === "claude" && auth.mode === "mock";
  const model = opts.model ?? runtimeConfig.model ?? runtimeConfig.runtime;
  const sessionId = opts.resume ?? newSessionId();
  touchSession(sessionId);
  appendTranscript(sessionId, "user", prompt);

  // Skill routing: when --skill is supplied, prepend the loaded SKILL.md body
  // to the prompt so the agent runs under that skill's instructions. A
  // missing skill is recorded as a warning but never blocks the run.
  let promptWithSkill = prompt;
  if (opts.skill) {
    const skill = loadSkillByName(opts.skill);
    if (skill) {
      promptWithSkill =
        `# Skill: ${skill.manifest.frontmatter.name}\n` +
        `${skill.manifest.frontmatter.description ?? ""}\n\n` +
        `## Skill instructions\n${skill.body}\n\n` +
        `## User task\n${prompt}`;
    } else {
      appendTranscript(sessionId, "system", `[warn] unknown skill: ${opts.skill}`);
    }
  }

  // Workflow routing: opt-in canned end-to-end flow. We dispatch and wrap
  // each step's result before returning, then reflect on the aggregate.
  if (opts.workflow) {
    const wf = getWorkflow(opts.workflow);
    if (!wf) {
      const text = `[error] unknown workflow: ${opts.workflow}`;
      appendTranscript(sessionId, "assistant", text);
      return { text, sessionId, auth: auth.mode, mock: willMock };
    }
    const result = await wf({
      prompt: promptWithSkill,
      sessionId,
      runAgent: (p, o) => runAgent(p, { ...opts, ...o, workflow: undefined }),
    });
    const summary = [
      `# Workflow: ${result.workflow} (${result.ok ? "ok" : "failed"})`,
      ...result.steps.map((s) => `- ${s.step}: ${s.ok ? "✓" : "✗"} ${s.summary}`),
      "",
      result.finalText,
    ].join("\n");
    appendTranscript(sessionId, "assistant", summary);
    reflect(sessionId, `workflow:${result.workflow}`, summary);
    return { text: summary, sessionId, auth: auth.mode, mock: willMock };
  }

  // autowebsearch: for coding-intent prompts, prime the agent with fresh 2026
  // results before any code is written. Only runs when we have real auth (no
  // point researching if we're returning a mock response anyway) and when
  // websearch isn't explicitly disabled.
  let effectivePrompt = promptWithSkill;
  const autoSearchDisabled = opts.noAutoSearch || process.env.QUANTUM_DISABLE_AUTOSEARCH === "1";
  if (!autoSearchDisabled && !opts.quantum && !willMock) {
    const intent = classify(prompt);
    if (intent.intent === "fix" || intent.intent === "implement") {
      const research = await autoWebSearch(prompt);
      if (research.results.length > 0) {
        effectivePrompt = `${promptWithSkill}\n\n## Fresh 2026 research\n${research.results
          .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.snippet}`)
          .join("\n")}`;
      }
    }
  }

  if (opts.quantum) {
    const result = await runQuantum(effectivePrompt, async (h): Promise<BranchOutcome> => {
      // Each branch runs an isolated agent invocation; in mock mode we synthesize.
      const inner = await runAgent(h.prompt, { ...opts, quantum: false, noAutoSearch: true });
      return { branch: h.branch, agent: h.agent, conclusion: inner.text };
    });
    const winner = result.measurement.winner?.conclusions[0] ?? "(no conclusion)";
    const text = `# Quantum result\nIntent: ${result.routing.intent}\nBranches: ${result.measurement.totalBranches}\nTunneled: ${result.tunneled}\n\nWinner:\n${winner}`;
    appendTranscript(sessionId, "assistant", text);
    reflect(sessionId, prompt.slice(0, 200), text);
    return { text, sessionId, auth: auth.mode, mock: willMock };
  }

  // Dispatch to the selected runtime's adapter (Claude / OpenAI Agents / Codex).
  // The adapter performs the real call for its runtime; only the Claude adapter
  // falls back to a mock transport, and only when no Claude credential exists.
  const out = await adapter.run(
    {
      prompt: effectivePrompt,
      model,
      sessionId,
      resume: opts.resume,
      signal: opts.signal,
      maxBudgetUsd: opts.maxBudgetUsd,
      baseUrl: process.env.QUANTUM_BASE_URL ?? process.env.OPENAI_BASE_URL,
    },
    process.env,
  );
  appendTranscript(sessionId, "assistant", out.text);
  reflect(sessionId, prompt.slice(0, 200), out.text);
  return { text: out.text, sessionId, auth: auth.mode, mock: out.mock };
}
