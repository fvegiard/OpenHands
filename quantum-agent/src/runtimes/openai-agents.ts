// OpenAI Agents SDK runtime adapter (@openai/agents). Direct OpenAI requires
// only @openai/agents; Vercel AI SDK providers additionally import
// @openai/agents-extensions and a configured provider package, and dispatch via
// aisdk(providerModel). The named key and base URL are wired explicitly into the
// SDK (never only described). Not bundled: an unavailable runtime throws with the
// exact package/secret — never a silent fallback. Built via a factory so the SDK
// importer is injectable for fake-SDK contract tests.

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

const PKGS = REGISTRY["openai-agents"].npmPackages; // ["@openai/agents","@openai/agents-extensions"]
const SECRETS = REGISTRY["openai-agents"].secretEnv; // ["OPENAI_API_KEY"]
const AGENTS_PKG = "@openai/agents";
const EXT_PKG = "@openai/agents-extensions";
const INSTRUCTIONS = "You are Quantum Agent. Prefer tools over guessing.";

interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
}
interface OpenAIAgentsSdk {
  Agent: new (cfg: { name: string; model: unknown; instructions?: string }) => object;
  run: (
    agent: object,
    input: string,
  ) => Promise<{ finalOutput?: unknown; usage?: UsageLike; state?: { usage?: UsageLike } }>;
  setDefaultOpenAIKey?: (key: string) => void;
  setDefaultOpenAIClient?: (client: unknown) => void;
}
interface OpenAIClientModule {
  default: new (opts: { apiKey?: string; baseURL?: string }) => object;
}
interface AiSdkExt {
  aisdk: (model: unknown) => unknown;
}
interface AiSdkProviderModule {
  default?: (model: string) => unknown;
  [named: string]: ((model: string) => unknown) | undefined;
}

function isAgentsSdk(m: unknown): m is OpenAIAgentsSdk {
  return (
    typeof m === "object" &&
    m !== null &&
    typeof (m as { Agent?: unknown }).Agent === "function" &&
    typeof (m as { run?: unknown }).run === "function"
  );
}

function mapUsage(u: UsageLike | undefined): RuntimeUsage | undefined {
  if (!u) return undefined;
  return {
    inputTokens: u.inputTokens ?? u.promptTokens,
    outputTokens: u.outputTokens ?? u.completionTokens,
    costUsd: u.totalCost,
  };
}

function baseUrlOf(input: RuntimeRunInput, env: NodeJS.ProcessEnv): string | undefined {
  return input.baseUrl ?? env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL ?? undefined;
}

export function makeOpenAIAgentsAdapter(importer: Importer = optionalImport): RuntimeAdapter {
  const checkAvailability = async (
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<RuntimeAvailability> => {
    const missingPackages: string[] = [];
    if (!isAgentsSdk(await importer(AGENTS_PKG))) missingPackages.push(AGENTS_PKG);
    const secret = presentSecret(SECRETS, env);
    const missingSecretNames = secret ? [] : [...SECRETS];
    const ok = missingPackages.length === 0 && !!secret;
    const parts: string[] = [];
    if (missingPackages.length) parts.push(`pnpm add ${PKGS.join(" ")}`);
    if (!secret) parts.push(`set one of: ${SECRETS.join(", ")}`);
    return { ok, missingPackages, missingSecretNames, reason: ok ? "ready" : parts.join("; ") };
  };

  const unavailable = (a: RuntimeAvailability): Error =>
    new Error(
      `runtime 'openai-agents' is unavailable and Quantum does not fall back: ${a.reason}.`,
    );

  // Resolve the model to hand to Agent: a bare string for direct OpenAI, or an
  // aisdk(providerModel) wrapper for a Vercel AI SDK provider.
  const resolveModel = async (
    input: RuntimeRunInput,
    env: NodeJS.ProcessEnv,
  ): Promise<{ model: unknown; provider: string }> => {
    const provider = env.QUANTUM_PROVIDER;
    if (provider && provider !== "openai" && provider !== "openai-compatible") {
      const ext = (await importer(EXT_PKG)) as AiSdkExt | null;
      if (!ext || typeof ext.aisdk !== "function") {
        throw new Error(`openai-agents ai-sdk path requires ${EXT_PKG} (pnpm add ${EXT_PKG}).`);
      }
      const pkg = env.QUANTUM_AISDK_PACKAGE;
      if (!pkg) {
        throw new Error(
          "ai-sdk provider selected but QUANTUM_AISDK_PACKAGE is not set (e.g. @ai-sdk/google).",
        );
      }
      const provMod = (await importer(pkg)) as AiSdkProviderModule | null;
      const factory = provMod?.default ?? provMod?.[provider];
      if (typeof factory !== "function") {
        throw new Error(
          `ai-sdk provider package '${pkg}' has no usable model factory (pnpm add ${pkg}).`,
        );
      }
      const providerModel = factory(input.model);
      return { model: ext.aisdk(providerModel), provider: `vercel-ai-sdk:${provider}` };
    }
    return { model: input.model, provider: baseUrlOf(input, env) ? "openai-compatible" : "openai" };
  };

  // Wire the named key + base URL explicitly into the SDK.
  const wireCredentials = async (
    mod: OpenAIAgentsSdk,
    env: NodeJS.ProcessEnv,
    baseUrl?: string,
  ): Promise<void> => {
    const key = secretValue(SECRETS, env);
    if (baseUrl) {
      const clientMod = (await importer("openai")) as OpenAIClientModule | null;
      if (!clientMod || typeof clientMod.default !== "function") {
        throw new Error(
          "base URL configured but the 'openai' client package is not installed (pnpm add openai).",
        );
      }
      const client = new clientMod.default({ apiKey: key, baseURL: baseUrl });
      if (typeof mod.setDefaultOpenAIClient === "function") mod.setDefaultOpenAIClient(client);
    } else if (key && typeof mod.setDefaultOpenAIKey === "function") {
      mod.setDefaultOpenAIKey(key);
    }
  };

  const drive = async (
    input: RuntimeRunInput,
    env: NodeJS.ProcessEnv,
  ): Promise<RuntimeRunResult> => {
    const a = await checkAvailability(env);
    if (!a.ok) throw unavailable(a);
    const mod = (await importer(AGENTS_PKG)) as OpenAIAgentsSdk | null;
    if (!isAgentsSdk(mod)) throw unavailable(a);
    const t0 = Date.now();
    const baseUrl = baseUrlOf(input, env);
    await wireCredentials(mod, env, baseUrl);
    const { model, provider } = await resolveModel(input, env);
    const agent = new mod.Agent({ name: "quantum", model, instructions: INSTRUCTIONS });
    const result = await mod.run(agent, input.prompt);
    const text =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : String(result.finalOutput ?? "");
    return {
      text,
      provider,
      model: input.model,
      mock: false,
      latencyMs: Date.now() - t0,
      usage: mapUsage(result.usage ?? result.state?.usage),
    };
  };

  return {
    id: "openai-agents",
    available: checkAvailability,
    run: (input, env = process.env) => drive(input, env),
    async liveProbe(env = process.env): Promise<LiveProbeResult> {
      const model = env.QUANTUM_MODEL || REGISTRY["openai-agents"].defaultModel;
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
        provider: out.provider,
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

export const openaiAgentsAdapter: RuntimeAdapter = makeOpenAIAgentsAdapter();
