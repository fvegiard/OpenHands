// Claude runtime adapter — wraps the official @anthropic-ai/claude-agent-sdk.
// Bundled default. With no credential it uses a deterministic mock transport;
// the mock flag is always reported truthfully and a live probe requires a real
// secret and an exact reply. Built via a factory so the SDK importer can be
// injected for fake-SDK contract tests.

import { resolveAuth } from "../auth.ts";
import { buildHooks } from "../hooks.ts";
import { buildCanUseTool } from "../permissions.ts";
import { REGISTRY } from "../providers/registry.ts";
import { buildQuantumToolset } from "../tools/index.ts";
import type {
  Importer,
  LiveProbeResult,
  RuntimeAdapter,
  RuntimeAvailability,
  RuntimeRunInput,
  RuntimeRunResult,
  RuntimeUsage,
} from "./adapter.ts";
import { normalizeReply, optionalImport } from "./adapter.ts";

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

function isClaudeSdk(m: unknown): m is ClaudeSdk {
  return (
    typeof m === "object" && m !== null && typeof (m as { query?: unknown }).query === "function"
  );
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

function extractUsage(msg: Record<string, unknown>): RuntimeUsage | undefined {
  const u = (msg.usage ?? (msg.message as { usage?: unknown } | undefined)?.usage) as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  const cost = msg.total_cost_usd;
  if (!u && typeof cost !== "number") return undefined;
  return {
    inputTokens: u?.input_tokens,
    outputTokens: u?.output_tokens,
    costUsd: typeof cost === "number" ? cost : undefined,
  };
}

export function makeClaudeAdapter(importer: Importer = optionalImport): RuntimeAdapter {
  const loadSdk = async (): Promise<ClaudeSdk | null> => {
    const mod = await importer(PKG);
    return isClaudeSdk(mod) ? mod : null;
  };

  const drive = async (
    sdk: ClaudeSdk,
    input: RuntimeRunInput,
    env: Record<string, string>,
  ): Promise<{ text: string; usage?: RuntimeUsage }> => {
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
    let text = "";
    let usage: RuntimeUsage | undefined;
    for await (const msg of sdk.query(queryArgs)) {
      const message = msg.message as
        | { content?: Array<{ type?: string; text?: string }> }
        | undefined;
      if (msg.type === "assistant" && message?.content) {
        for (const block of message.content) {
          if (block.type === "text" && block.text) text += block.text;
        }
      }
      const u = extractUsage(msg);
      if (u) usage = u;
    }
    return { text, usage };
  };

  return {
    id: "claude",

    async available(env = process.env): Promise<RuntimeAvailability> {
      const sdk = await loadSdk();
      return {
        ok: !!sdk,
        missingPackages: sdk ? [] : [PKG],
        missingSecretNames: SECRETS.some((n) => env[n]) ? [] : [...SECRETS],
        reason: sdk ? "installed" : `install: pnpm add ${PKG}`,
      };
    },

    async run(input, env = process.env): Promise<RuntimeRunResult> {
      const t0 = Date.now();
      const auth = resolveAuth(env);
      const sdk = await loadSdk();
      if (!sdk || auth.mode === "mock") {
        return {
          text: `[mock] ${input.prompt.slice(0, 200)}`,
          provider: "anthropic",
          model: input.model,
          mock: true,
          latencyMs: Date.now() - t0,
        };
      }
      const { text, usage } = await drive(sdk, input, auth.env);
      return {
        text,
        provider: "anthropic",
        model: input.model,
        mock: false,
        latencyMs: Date.now() - t0,
        usage,
      };
    },

    async liveProbe(env = process.env): Promise<LiveProbeResult> {
      const model = env.QUANTUM_MODEL || REGISTRY.claude.defaultModel;
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
      const { text, usage } = await drive(
        sdk,
        { prompt: "Reply with exactly one word: pong", model, sessionId: `probe-${t0}` },
        auth.env,
      );
      const ok = normalizeReply(text) === "pong";
      return {
        status: "live",
        ok,
        provider: "anthropic",
        model,
        latencyMs: Date.now() - t0,
        usage,
        message: ok
          ? "live call ok (exact pong)"
          : `live call ran but reply != pong: ${text.slice(0, 40)}`,
      };
    },
  };
}

export const claudeAdapter: RuntimeAdapter = makeClaudeAdapter();
