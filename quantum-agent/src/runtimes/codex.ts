// OpenAI Codex SDK runtime adapter (@openai/codex-sdk) — a distinct coding-agent
// runtime (NOT the OpenAI Agents SDK). Wires the selected model, unattended
// permissions (sandbox=danger-full-access, approval=never), start vs resume
// threads, and a sanitized env carrying the selected key/base URL into the SDK.
// Not bundled: unavailable throws with the exact package/secret (no fallback).
// Built via a factory so the SDK importer is injectable for fake-SDK tests.

import { REGISTRY } from "../providers/registry.ts";
import type {
  Importer,
  LiveProbeResult,
  RuntimeAdapter,
  RuntimeAvailability,
  RuntimeRunInput,
  RuntimeRunResult,
  RuntimeUsage,
} from "./adapter.ts";
import { normalizeReply, optionalImport, presentSecret, secretValue } from "./adapter.ts";

const PKG = "@openai/codex-sdk";
const SECRETS = REGISTRY.codex.secretEnv; // ["OPENAI_API_KEY","CODEX_API_KEY"]

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
}
interface CodexThread {
  run: (input: string) => Promise<{ finalResponse?: unknown; usage?: UsageLike }>;
}
interface CodexInstance {
  startThread: (opts: Record<string, unknown>) => CodexThread;
  resumeThread: (id: string) => CodexThread;
}
interface CodexSdk {
  Codex: new (opts: {
    apiKey?: string;
    baseUrl?: string;
    env?: Record<string, string>;
  }) => CodexInstance;
}

function isCodexSdk(m: unknown): m is CodexSdk {
  return (
    typeof m === "object" && m !== null && typeof (m as { Codex?: unknown }).Codex === "function"
  );
}

function mapUsage(u: UsageLike | undefined): RuntimeUsage | undefined {
  if (!u) return undefined;
  return { inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.totalCost };
}

// Minimal env for the Codex subprocess: only the selected secret + base URL.
function sanitizedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  const path = env.PATH;
  if (path) out.PATH = path;
  const key = secretValue(SECRETS, env);
  if (key) {
    // Expose under whichever name the caller provided (do not invent values).
    if (env.CODEX_API_KEY) out.CODEX_API_KEY = env.CODEX_API_KEY;
    if (env.OPENAI_API_KEY) out.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }
  const baseUrl = env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL;
  if (baseUrl) out.OPENAI_BASE_URL = baseUrl;
  return out;
}

export function makeCodexAdapter(importer: Importer = optionalImport): RuntimeAdapter {
  const checkAvailability = async (
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RuntimeAvailability> => {
    const missingPackages = isCodexSdk(await importer(PKG)) ? [] : [PKG];
    const secret = presentSecret(SECRETS, env);
    const missingSecretNames = secret ? [] : [...SECRETS];
    const ok = missingPackages.length === 0 && !!secret;
    const parts: string[] = [];
    if (missingPackages.length) parts.push(`pnpm add ${PKG}`);
    if (!secret) parts.push(`set one of: ${SECRETS.join(", ")}`);
    return { ok, missingPackages, missingSecretNames, reason: ok ? "ready" : parts.join("; ") };
  };

  const unavailable = (a: RuntimeAvailability): Error =>
    new Error(`runtime 'codex' is unavailable and Quantum does not fall back: ${a.reason}.`);

  const drive = async (
    input: RuntimeRunInput,
    env: NodeJS.ProcessEnv,
  ): Promise<RuntimeRunResult> => {
    const a = await checkAvailability(env);
    if (!a.ok) throw unavailable(a);
    const mod = (await importer(PKG)) as CodexSdk | null;
    if (!isCodexSdk(mod)) throw unavailable(a);
    const t0 = Date.now();
    const key = secretValue(SECRETS, env);
    const baseUrl = input.baseUrl ?? env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL;
    const codex = new mod.Codex({ apiKey: key, baseUrl, env: sanitizedEnv(env) });
    // Start a fresh thread or resume an existing one.
    const thread = input.resume
      ? codex.resumeThread(input.resume)
      : codex.startThread({
          model: input.model,
          workingDirectory: env.QUANTUM_WORKDIR ?? process.cwd(),
          sandboxMode: "danger-full-access",
          approvalPolicy: "never",
          skipGitRepoCheck: true,
        });
    const result = await thread.run(input.prompt);
    const text =
      typeof result.finalResponse === "string"
        ? result.finalResponse
        : String(result.finalResponse ?? "");
    return {
      text,
      provider: "openai",
      model: input.model,
      mock: false,
      latencyMs: Date.now() - t0,
      usage: mapUsage(result.usage),
    };
  };

  return {
    id: "codex",
    available: checkAvailability,
    run: (input, env = process.env) => drive(input, env),
    async liveProbe(env = process.env): Promise<LiveProbeResult> {
      const model = env.QUANTUM_MODEL || REGISTRY.codex.defaultModel;
      const a = await checkAvailability(env);
      if (!a.ok) {
        return {
          status: "not_verified",
          ok: false,
          provider: "openai",
          model,
          message: `not executed: ${a.reason}`,
        };
      }
      const t0 = Date.now();
      const out = await drive(
        { prompt: "Reply with exactly one word: pong", model, sessionId: `probe-${t0}` },
        env,
      );
      const ok = normalizeReply(out.text) === "pong";
      return {
        status: "live",
        ok,
        provider: "openai",
        model,
        latencyMs: Date.now() - t0,
        usage: out.usage,
        message: ok
          ? "live call ok (exact pong)"
          : `live call ran but reply != pong: ${out.text.slice(0, 40)}`,
      };
    },
  };
}

export const codexAdapter: RuntimeAdapter = makeCodexAdapter();
