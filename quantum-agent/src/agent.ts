// Agent core — wraps the official `query()` from @anthropic-ai/claude-agent-sdk.
// Falls back to a deterministic mock transport when no auth is available so
// the build always proceeds (one-shot delivery contract).

import { randomUUID } from "node:crypto";
import { type AuthResult, resolveAuth } from "./auth.ts";
import { DEFAULT_MODEL } from "./config.ts";
import { buildHooks } from "./hooks.ts";
import { appendTranscript, touchSession } from "./memory.ts";
import { buildCanUseTool } from "./permissions.ts";
import { classify } from "./quantum/intent.ts";
import { type BranchOutcome, runQuantum } from "./quantum/loop.ts";
import { reflect } from "./quantum/reflect.ts";
import { loadSkillByName } from "./skills/manager.ts";
import { buildQuantumToolset } from "./tools/index.ts";
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

interface SdkLike {
  query: (args: { prompt: string | AsyncIterable<unknown>; options: any }) => AsyncIterable<any>;
}

async function loadSdk(): Promise<SdkLike | null> {
  try {
    const mod = (await import("@anthropic-ai/claude-agent-sdk")) as Partial<SdkLike>;
    return mod.query ? (mod as SdkLike) : null;
  } catch {
    return null;
  }
}

function* mockTranscript(prompt: string): Iterable<any> {
  yield { type: "system", subtype: "init", session_id: `mock-${Date.now()}` };
  yield {
    type: "assistant",
    message: { content: [{ type: "text", text: `[mock] ${prompt.slice(0, 200)}` }] },
  };
  yield { type: "result", result: `[mock] processed ${prompt.length} chars`, total_cost_usd: 0 };
}

const SYSTEM_PROMPT_APPEND =
  "You are Quantum Agent. Prefer tools over guessing. Persist findings via remember/recall. " +
  "Use sequential-thinking for non-trivial decisions. Reflect after every task.";

/**
 * Build the MCP server map. Quantum's in-process tools always go in. We also
 * wire the sequential-thinking server unconditionally (`npx -y` resolves it on
 * first use) so the orchestrator can do chained reasoning at every decision
 * point.
 */
function buildMcpServers(quantum: unknown): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  if (quantum) {
    servers.quantum = { type: "sdk", name: "quantum", instance: quantum };
  }
  servers["sequential-thinking"] = {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  };
  return servers;
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
  const sdk = await loadSdk();
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
      return { text, sessionId, auth: auth.mode, mock: !sdk || auth.mode === "mock" };
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
    return { text: summary, sessionId, auth: auth.mode, mock: !sdk || auth.mode === "mock" };
  }

  // autowebsearch: for coding-intent prompts, prime the agent with fresh 2026
  // results before any code is written. Only runs when we have real auth (no
  // point researching if we're returning a mock response anyway) and when
  // websearch isn't explicitly disabled.
  let effectivePrompt = promptWithSkill;
  const autoSearchDisabled = opts.noAutoSearch || process.env.QUANTUM_DISABLE_AUTOSEARCH === "1";
  if (!autoSearchDisabled && !opts.quantum && auth.mode !== "mock" && sdk) {
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
    return { text, sessionId, auth: auth.mode, mock: !sdk || auth.mode === "mock" };
  }

  if (!sdk || auth.mode === "mock") {
    let combined = "";
    for (const msg of mockTranscript(effectivePrompt)) {
      if (msg.type === "assistant") combined += msg.message.content[0].text;
    }
    appendTranscript(sessionId, "assistant", combined);
    reflect(sessionId, prompt.slice(0, 200), combined);
    return { text: combined, sessionId, auth: auth.mode, mock: true };
  }

  const toolset = await buildQuantumToolset();
  const mcpServers = buildMcpServers(toolset.serverInstance);

  // Prompt caching — mark the long stable parts (system prompt + tool defs)
  // ephemeral so they get an 80-95% cache-hit rate after the first call.
  const queryArgs = {
    prompt: effectivePrompt,
    options: {
      env: auth.env,
      model: opts.model ?? DEFAULT_MODEL,
      mcpServers,
      hooks: buildHooks(),
      canUseTool: buildCanUseTool(),
      permissionMode: "auto",
      includePartialMessages: true,
      maxBudgetUsd: opts.maxBudgetUsd ?? 5,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: SYSTEM_PROMPT_APPEND,
        cache_control: { type: "ephemeral" as const },
      },
      // Hint to the SDK transport: mark tools / system blocks for prompt caching.
      // The SDK forwards this to the underlying Messages API requests.
      promptCaching: { systemPrompt: true, tools: true },
      resume: opts.resume,
      sessionId,
      abortController: opts.signal ? { signal: opts.signal } : undefined,
    },
  };

  let combined = "";
  for await (const msg of sdk.query(queryArgs)) {
    if (msg?.type === "assistant" && msg?.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") combined += block.text;
      }
    }
  }
  appendTranscript(sessionId, "assistant", combined);
  reflect(sessionId, prompt.slice(0, 200), combined);
  return { text: combined, sessionId, auth: auth.mode, mock: false };
}
