// Agent core — wraps the official `query()` from @anthropic-ai/claude-agent-sdk.
// Falls back to a deterministic mock transport when no auth is available so
// the build always proceeds (one-shot delivery contract).

import { type AuthResult, resolveAuth } from "./auth.ts";
import { DEFAULT_MODEL } from "./config.ts";
import { buildHooks } from "./hooks.ts";
import { appendTranscript, touchSession } from "./memory.ts";
import { classify } from "./quantum/intent.ts";
import { type BranchOutcome, runQuantum } from "./quantum/loop.ts";
import { buildQuantumToolset } from "./tools/index.ts";
import { autoWebSearch } from "./tools/web.ts";

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

export async function runAgent(prompt: string, opts: RunOptions = {}): Promise<RunResult> {
  const auth = resolveAuth();
  const sdk = await loadSdk();
  const sessionId = opts.resume ?? `q-${Date.now()}`;
  touchSession(sessionId);
  appendTranscript(sessionId, "user", prompt);

  // autowebsearch: for coding-intent prompts, prime the agent with fresh 2026
  // results before any code is written. Only runs when we have real auth (no
  // point researching if we're returning a mock response anyway) and when
  // websearch isn't explicitly disabled.
  let effectivePrompt = prompt;
  const autoSearchDisabled =
    opts.noAutoSearch || process.env.QUANTUM_DISABLE_AUTOSEARCH === "1";
  if (!autoSearchDisabled && !opts.quantum && auth.mode !== "mock" && sdk) {
    const intent = classify(prompt);
    if (intent.intent === "fix" || intent.intent === "implement") {
      const research = await autoWebSearch(prompt);
      if (research.results.length > 0) {
        effectivePrompt = `${prompt}\n\n## Fresh 2026 research\n${research.results
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
    return { text, sessionId, auth: auth.mode, mock: !sdk || auth.mode === "mock" };
  }

  if (!sdk || auth.mode === "mock") {
    let combined = "";
    for (const msg of mockTranscript(effectivePrompt)) {
      if (msg.type === "assistant") combined += msg.message.content[0].text;
    }
    appendTranscript(sessionId, "assistant", combined);
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
  return { text: combined, sessionId, auth: auth.mode, mock: false };
}
