// Claude runtime adapter — wraps the official @anthropic-ai/claude-agent-sdk.
// This is the bundled default. With no credential it uses a deterministic mock
// transport (so the build/tests proceed); the mock flag is always reported
// truthfully and a live probe requires a real secret.

import { resolveAuth } from "../auth.ts";
import { buildHooks } from "../hooks.ts";
import { buildCanUseTool } from "../permissions.ts";
import { REGISTRY } from "../providers/registry.ts";
import { buildQuantumToolset } from "../tools/index.ts";
import type {
  LiveProbeResult,
  RuntimeAdapter,
  RuntimeAvailability,
  RuntimeRunInput,
  RuntimeRunResult,
} from "./adapter.ts";
import { optionalImport } from "./adapter.ts";

interface ClaudeSdk {
  query: (args: {
    prompt: string | AsyncIterable<unknown>;
    options: Record<string, unknown>;
  }) => AsyncIterable<Record<string, unknown>>;
}

const PKG = "@anthropic-ai/claude-agent-sdk";
const SECRETS = REGISTRY.claude.secretEnv;

const SYSTEM_PROMPT_APPEND =
  "You are Quantum Agent. Prefer tools over guessing. Persist findings via remember/recall. " +
  "Use sequential-thinking for non-trivial decisions. Reflect after every task.";

async function loadSdk(): Promise<ClaudeSdk | null> {
  const mod = (await optionalImport(PKG)) as Partial<ClaudeSdk> | null;
  return mod && typeof mod.query === "function" ? (mod as ClaudeSdk) : null;
}

function buildMcpServers(quantum: unknown): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  if (quantum) servers.quantum = { type: "sdk", name: "quantum", instance: quantum };
  servers["sequential-thinking"] = {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  };
  return servers;
}

function* mockTranscript(prompt: string): Iterable<string> {
  yield `[mock] ${prompt.slice(0, 200)}`;
}

async function realQuery(
  sdk: ClaudeSdk,
  input: RuntimeRunInput,
  env: Record<string, string>,
): Promise<string> {
  const toolset = await buildQuantumToolset();
  const queryArgs = {
    prompt: input.prompt,
    options: {
      env,
      model: input.model,
      mcpServers: buildMcpServers(toolset.serverInstance),
      hooks: buildHooks(),
      canUseTool: buildCanUseTool(),
      permissionMode: "bypassPermissions",
      includePartialMessages: true,
      maxBudgetUsd: input.maxBudgetUsd ?? 5,
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: SYSTEM_PROMPT_APPEND,
        cache_control: { type: "ephemeral" as const },
      },
      promptCaching: { systemPrompt: true, tools: true },
      resume: input.resume,
      sessionId: input.sessionId,
      abortController: input.signal ? { signal: input.signal } : undefined,
    },
  };
  let combined = "";
  for await (const msg of sdk.query(queryArgs)) {
    const message = msg.message as
      | { content?: Array<{ type?: string; text?: string }> }
      | undefined;
    if (msg.type === "assistant" && message?.content) {
      for (const block of message.content) {
        if (block.type === "text" && block.text) combined += block.text;
      }
    }
  }
  return combined;
}

export const claudeAdapter: RuntimeAdapter = {
  id: "claude",

  async available(env = process.env): Promise<RuntimeAvailability> {
    const sdk = await loadSdk();
    const missingPackages = sdk ? [] : [PKG];
    // Claude can always *run* when the package is present (mock without secret);
    // secret is only required for a live call.
    return {
      ok: !!sdk,
      missingPackages,
      missingSecretNames: SECRETS.some((n) => env[n]) ? [] : [...SECRETS],
      reason: sdk ? "installed" : `install: pnpm add ${PKG}`,
    };
  },

  async run(input, env = process.env): Promise<RuntimeRunResult> {
    const t0 = Date.now();
    const auth = resolveAuth(env);
    const sdk = await loadSdk();
    if (!sdk || auth.mode === "mock") {
      let text = "";
      for (const chunk of mockTranscript(input.prompt)) text += chunk;
      return {
        text,
        provider: "anthropic",
        model: input.model,
        mock: true,
        latencyMs: Date.now() - t0,
      };
    }
    const text = await realQuery(sdk, input, auth.env);
    return {
      text,
      provider: "anthropic",
      model: input.model,
      mock: false,
      latencyMs: Date.now() - t0,
    };
  },

  async liveProbe(env = process.env): Promise<LiveProbeResult> {
    const model = env.QUANTUM_MODEL ?? REGISTRY.claude.defaultModel;
    const sdk = await loadSdk();
    const auth = resolveAuth(env);
    if (!sdk) {
      return {
        status: "not_verified",
        ok: false,
        provider: "anthropic",
        model,
        message: `package ${PKG} not installed`,
      };
    }
    if (auth.mode === "mock") {
      return {
        status: "not_verified",
        ok: false,
        provider: "anthropic",
        model,
        message: `no secret set (one of ${SECRETS.join(", ")}); live call not executed`,
      };
    }
    const t0 = Date.now();
    const text = await realQuery(
      sdk,
      { prompt: "Reply with the single word: pong", model, sessionId: `probe-${t0}` },
      auth.env,
    );
    return {
      status: "live",
      ok: text.length > 0,
      provider: "anthropic",
      model,
      latencyMs: Date.now() - t0,
      message: `live call ok (${text.slice(0, 40)})`,
    };
  },
};
