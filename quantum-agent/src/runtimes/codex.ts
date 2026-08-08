// OpenAI Codex SDK runtime adapter (@openai/codex-sdk) — a distinct coding-agent
// runtime, NOT the same as the OpenAI Agents SDK. Not bundled: when the package
// or secret is absent, run()/liveProbe() report the exact package + secret and
// NEVER fall back to another runtime.

import { REGISTRY } from "../providers/registry.ts";
import type {
  LiveProbeResult,
  RuntimeAdapter,
  RuntimeAvailability,
  RuntimeRunInput,
  RuntimeRunResult,
} from "./adapter.ts";
import { optionalImport, presentSecret } from "./adapter.ts";

const PKGS = REGISTRY.codex.npmPackages;
const SECRETS = REGISTRY.codex.secretEnv;

/** Minimal typed surface of @openai/codex-sdk that we depend on. */
interface CodexThread {
  run: (input: string) => Promise<{ finalResponse?: unknown }>;
}
interface CodexSdk {
  Codex: new (cfg?: {
    apiKey?: string;
    baseUrl?: string;
  }) => {
    startThread: () => CodexThread;
  };
}

function isCodexSdk(m: unknown): m is CodexSdk {
  return (
    typeof m === "object" && m !== null && typeof (m as { Codex?: unknown }).Codex === "function"
  );
}

async function checkAvailability(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeAvailability> {
  const missingPackages: string[] = [];
  for (const p of PKGS) {
    if ((await optionalImport(p)) === null) missingPackages.push(p);
  }
  const secret = presentSecret(SECRETS, env);
  const missingSecretNames = secret ? [] : [...SECRETS];
  const ok = missingPackages.length === 0 && !!secret;
  const parts: string[] = [];
  if (missingPackages.length) parts.push(`pnpm add ${missingPackages.join(" ")}`);
  if (!secret) parts.push(`set one of: ${SECRETS.join(", ")}`);
  return { ok, missingPackages, missingSecretNames, reason: ok ? "ready" : parts.join("; ") };
}

function unavailableError(a: RuntimeAvailability): Error {
  return new Error(
    `runtime 'codex' is unavailable and Quantum does not fall back: ${a.reason}. ` +
      "Select an available runtime or provide the package/secret.",
  );
}

export const codexAdapter: RuntimeAdapter = {
  id: "codex",
  available: checkAvailability,

  async run(input: RuntimeRunInput, env = process.env): Promise<RuntimeRunResult> {
    const a = await checkAvailability(env);
    if (!a.ok) throw unavailableError(a);
    const pkg = PKGS[0];
    const mod = pkg ? await optionalImport(pkg) : null;
    if (!isCodexSdk(mod)) throw unavailableError(a);
    const t0 = Date.now();
    const codex = new mod.Codex({ baseUrl: env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL });
    const thread = codex.startThread();
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
    };
  },

  async liveProbe(env = process.env): Promise<LiveProbeResult> {
    const model = env.QUANTUM_MODEL ?? REGISTRY.codex.defaultModel;
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
    const out = await this.run(
      { prompt: "Reply with the single word: pong", model, sessionId: `probe-${t0}` },
      env,
    );
    return {
      status: "live",
      ok: out.text.length > 0,
      provider: "openai",
      model,
      latencyMs: Date.now() - t0,
      message: `live call ok (${out.text.slice(0, 40)})`,
    };
  },
};
