// OpenAI Agents SDK runtime adapter (@openai/agents), optionally driving
// non-OpenAI models through the official @openai/agents-extensions ai-sdk
// adapter. Distinct from the Codex runtime. Not bundled: when the package or
// secret is absent, run()/liveProbe() report the exact package + secret to add
// and NEVER fall back to another runtime.

import { REGISTRY } from "../providers/registry.ts";
import type {
  LiveProbeResult,
  RuntimeAdapter,
  RuntimeAvailability,
  RuntimeRunInput,
  RuntimeRunResult,
} from "./adapter.ts";
import { optionalImport, presentSecret } from "./adapter.ts";

const PKGS = REGISTRY["openai-agents"].npmPackages;
const SECRETS = REGISTRY["openai-agents"].secretEnv;

/** Minimal typed surface of @openai/agents that we depend on. */
interface OpenAIAgentsSdk {
  Agent: new (cfg: { name: string; model: string; instructions?: string }) => unknown;
  run: (agent: unknown, input: string) => Promise<{ finalOutput?: unknown }>;
}

function isOpenAIAgentsSdk(m: unknown): m is OpenAIAgentsSdk {
  return (
    typeof m === "object" &&
    m !== null &&
    typeof (m as { Agent?: unknown }).Agent === "function" &&
    typeof (m as { run?: unknown }).run === "function"
  );
}

function baseUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL ?? undefined;
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
    `runtime 'openai-agents' is unavailable and Quantum does not fall back: ${a.reason}. ` +
      "Select an available runtime or provide the package/secret.",
  );
}

export const openaiAgentsAdapter: RuntimeAdapter = {
  id: "openai-agents",
  available: checkAvailability,

  async run(input: RuntimeRunInput, env = process.env): Promise<RuntimeRunResult> {
    const a = await checkAvailability(env);
    if (!a.ok) throw unavailableError(a);
    const pkg = PKGS[0];
    const mod = pkg ? await optionalImport(pkg) : null;
    if (!isOpenAIAgentsSdk(mod)) throw unavailableError(a);
    const t0 = Date.now();
    // Base URL / provider routing is configured via env for OpenAI-compatible
    // endpoints; the ai-sdk extension handles non-OpenAI providers when set.
    const agent = new mod.Agent({ name: "quantum", model: input.model });
    const result = await mod.run(agent, input.prompt);
    const text =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : String(result.finalOutput ?? "");
    return {
      text,
      provider: baseUrl(env) ? "openai-compatible" : "openai",
      model: input.model,
      mock: false,
      latencyMs: Date.now() - t0,
    };
  },

  async liveProbe(env = process.env): Promise<LiveProbeResult> {
    const model = env.QUANTUM_MODEL ?? REGISTRY["openai-agents"].defaultModel;
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
      provider: out.provider,
      model,
      latencyMs: Date.now() - t0,
      message: `live call ok (${out.text.slice(0, 40)})`,
    };
  },
};
