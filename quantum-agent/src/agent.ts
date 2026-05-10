// Agent core — wraps the official `query()` from @anthropic-ai/claude-agent-sdk.
// Falls back to a deterministic mock transport when no auth is available so
// the build always proceeds (one-shot delivery contract).

import { type AuthResult, resolveAuth } from "./auth.ts";
import { DEFAULT_MODEL } from "./config.ts";
import { buildHooks } from "./hooks.ts";
import { appendTranscript, touchSession } from "./memory.ts";
import { type BranchOutcome, runQuantum } from "./quantum/loop.ts";
import { buildQuantumToolset } from "./tools/index.ts";

export interface RunOptions {
  resume?: string;
  model?: string;
  quantum?: boolean;
  speak?: boolean;
  workflow?: string;
  skill?: string;
  signal?: AbortSignal;
  maxBudgetUsd?: number;
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

export async function runAgent(prompt: string, opts: RunOptions = {}): Promise<RunResult> {
  const auth = resolveAuth();
  const sdk = await loadSdk();
  const sessionId = opts.resume ?? `q-${Date.now()}`;
  touchSession(sessionId);
  appendTranscript(sessionId, "user", prompt);

  if (opts.quantum) {
    const result = await runQuantum(prompt, async (h): Promise<BranchOutcome> => {
      // Each branch runs an isolated agent invocation; in mock mode we synthesize.
      const inner = await runAgent(h.prompt, { ...opts, quantum: false });
      return { branch: h.branch, agent: h.agent, conclusion: inner.text };
    });
    const winner = result.measurement.winner?.conclusions[0] ?? "(no conclusion)";
    const text = `# Quantum result\nIntent: ${result.routing.intent}\nBranches: ${result.measurement.totalBranches}\nTunneled: ${result.tunneled}\n\nWinner:\n${winner}`;
    appendTranscript(sessionId, "assistant", text);
    return { text, sessionId, auth: auth.mode, mock: !sdk || auth.mode === "mock" };
  }

  if (!sdk || auth.mode === "mock") {
    let combined = "";
    for (const msg of mockTranscript(prompt)) {
      if (msg.type === "assistant") combined += msg.message.content[0].text;
    }
    appendTranscript(sessionId, "assistant", combined);
    return { text: combined, sessionId, auth: auth.mode, mock: true };
  }

  const toolset = await buildQuantumToolset();
  const mcpServers: Record<string, unknown> = {};
  if (toolset.serverInstance) {
    mcpServers.quantum = { type: "sdk", name: "quantum", instance: toolset.serverInstance };
  }

  const queryArgs = {
    prompt,
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
        append:
          "You are Quantum Agent. Prefer tools over guessing. Persist findings via remember/recall.",
      },
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
