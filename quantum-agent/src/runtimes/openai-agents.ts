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
  RuntimeProfile,
  RuntimeRunInput,
  RuntimeRunResult,
  RuntimeUsage,
} from "./adapter.ts";
import { normalizeReply, optionalImport, resolveSecret } from "./adapter.ts";

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
  // Per-run, client-bound model classes (real exports of @openai/agents). We use
  // these to isolate credentials per run — never the process-global setters.
  OpenAIResponsesModel?: new (
    client: unknown,
    model: string,
  ) => object;
  OpenAIChatCompletionsModel?: new (client: unknown, model: string) => object;
}
interface OpenAIClientModule {
  default: new (opts: { apiKey?: string; baseURL?: string }) => object;
}
interface AiSdkExt {
  aisdk: (model: unknown) => unknown;
}
/** A Vercel AI SDK provider package: a named/default instance factory
 * `provider(model)`, and optionally a `create<Provider>({apiKey,baseURL})`
 * creator that returns a configured instance (lets us inject the key explicitly
 * into THIS provider — no global env mutation). */
type ProviderFactory = (model: string) => unknown;
type ProviderCreator = (opts: { apiKey?: string; baseURL?: string }) => ProviderFactory;
interface AiSdkProviderModule {
  default?: ProviderFactory;
  [named: string]: ProviderFactory | ProviderCreator | undefined;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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

function baseUrlOf(
  input: RuntimeRunInput,
  env: NodeJS.ProcessEnv,
  profile?: RuntimeProfile,
): string | undefined {
  return (
    input.baseUrl ?? profile?.baseUrl ?? env.QUANTUM_BASE_URL ?? env.OPENAI_BASE_URL ?? undefined
  );
}

export function makeOpenAIAgentsAdapter(importer: Importer = optionalImport): RuntimeAdapter {
  const checkAvailability = async (
    env: NodeJS.ProcessEnv = process.env,
    profile?: RuntimeProfile,
  ): Promise<RuntimeAvailability> => {
    const missingPackages: string[] = [];
    if (!isAgentsSdk(await importer(AGENTS_PKG))) missingPackages.push(AGENTS_PKG);
    const sec = resolveSecret(SECRETS, env, profile?.secretEnv);
    const missingSecretNames = sec.present ? [] : [...sec.names];
    const ok = missingPackages.length === 0 && !!sec.present && !sec.invalidName;
    const parts: string[] = [];
    if (missingPackages.length) parts.push(`pnpm add ${PKGS.join(" ")}`);
    if (sec.invalidName) parts.push(`invalid secret env NAME '${sec.invalidName}'`);
    else if (!sec.present) parts.push(`set one of: ${sec.names.join(", ")}`);
    return { ok, missingPackages, missingSecretNames, reason: ok ? "ready" : parts.join("; ") };
  };

  const unavailable = (a: RuntimeAvailability): Error =>
    new Error(
      `runtime 'openai-agents' is unavailable and Quantum does not fall back: ${a.reason}.`,
    );

  // Resolve the model to hand to Agent: a bare string for direct OpenAI, or an
  // aisdk(providerModel) wrapper for a Vercel AI SDK provider. For an ai-sdk
  // provider the profile's key/baseURL are injected into THAT provider (via its
  // create<Provider> factory when available) — never into the OpenAI globals.
  const resolveModel = async (
    input: RuntimeRunInput,
    env: NodeJS.ProcessEnv,
    profile: RuntimeProfile | undefined,
    key: string | undefined,
    baseUrl: string | undefined,
  ): Promise<{ model: unknown; provider: string; aisdk: boolean }> => {
    const provider = profile?.provider ?? env.QUANTUM_PROVIDER;
    if (provider && provider !== "openai" && provider !== "openai-compatible") {
      const ext = (await importer(EXT_PKG)) as AiSdkExt | null;
      if (!ext || typeof ext.aisdk !== "function") {
        throw new Error(`openai-agents ai-sdk path requires ${EXT_PKG} (pnpm add ${EXT_PKG}).`);
      }
      const pkg =
        profile?.providerPackage ?? env.QUANTUM_PROVIDER_PACKAGE ?? env.QUANTUM_AISDK_PACKAGE;
      if (!pkg) {
        throw new Error(
          `ai-sdk provider '${provider}' selected but no provider package set ` +
            "(pass --provider-package or QUANTUM_PROVIDER_PACKAGE, e.g. vercel-minimax-ai-provider).",
        );
      }
      const provMod = (await importer(pkg)) as AiSdkProviderModule | null;
      if (!provMod)
        throw new Error(`ai-sdk provider package '${pkg}' not installed (pnpm add ${pkg}).`);
      // Prefer a configurable creator so the key/baseURL go into THIS provider.
      const creator = provMod[`create${capitalize(provider)}`];
      let factory: ProviderFactory | undefined;
      if (typeof creator === "function") {
        factory = (creator as ProviderCreator)({ apiKey: key, baseURL: baseUrl });
      } else {
        const instance = provMod[provider] ?? provMod.default;
        if (typeof instance !== "function") {
          throw new Error(
            `ai-sdk provider package '${pkg}' has no '${provider}' export, ` +
              `'create${capitalize(provider)}' factory, or default (pnpm add ${pkg}).`,
          );
        }
        factory = instance as ProviderFactory;
      }
      const providerModel = factory(input.model);
      return {
        model: ext.aisdk(providerModel),
        provider: `vercel-ai-sdk:${provider}`,
        aisdk: true,
      };
    }
    return {
      model: input.model,
      provider: baseUrl ? "openai-compatible" : "openai",
      aisdk: false,
    };
  };

  // Build a per-run, client-bound model for the DIRECT OpenAI path. The profile's
  // key/baseURL go into a fresh OpenAI client that is bound to THIS run's model
  // instance — there is NO process-global mutation (no setDefaultOpenAIKey /
  // setDefaultOpenAIClient), so sequential runs with different profiles cannot
  // leak credentials into one another in a long-lived process.
  const buildDirectModel = async (
    mod: OpenAIAgentsSdk,
    key: string | undefined,
    baseUrl: string | undefined,
    modelName: string,
  ): Promise<object> => {
    const clientMod = (await importer("openai")) as OpenAIClientModule | null;
    if (!clientMod || typeof clientMod.default !== "function") {
      throw new Error("openai client package not installed (pnpm add openai).");
    }
    const client = new clientMod.default({ apiKey: key, baseURL: baseUrl });
    const ModelCtor = mod.OpenAIResponsesModel ?? mod.OpenAIChatCompletionsModel;
    if (typeof ModelCtor !== "function") {
      // Fail closed rather than fall back to a process-global default key/client.
      throw new Error(
        "cannot isolate openai-agents credentials: no per-run model class " +
          "(OpenAIResponsesModel / OpenAIChatCompletionsModel) — refusing global mutation.",
      );
    }
    return new ModelCtor(client, modelName);
  };

  const drive = async (
    input: RuntimeRunInput,
    env: NodeJS.ProcessEnv,
    profile?: RuntimeProfile,
  ): Promise<RuntimeRunResult> => {
    const a = await checkAvailability(env, profile);
    if (!a.ok) throw unavailable(a);
    const mod = (await importer(AGENTS_PKG)) as OpenAIAgentsSdk | null;
    if (!isAgentsSdk(mod)) throw unavailable(a);
    const t0 = Date.now();
    const baseUrl = baseUrlOf(input, env, profile);
    const sec = resolveSecret(SECRETS, env, profile?.secretEnv);
    const resolved = await resolveModel(input, env, profile, sec.value, baseUrl);
    const { provider, aisdk } = resolved;
    // ai-sdk provider: the key/baseURL are already bound to that provider (via its
    // create<Provider> factory). Direct OpenAI: bind a per-run client to the model
    // (no globals). Either way, nothing is written to a process-global default.
    const model = aisdk
      ? resolved.model
      : await buildDirectModel(mod, sec.value, baseUrl, input.model);
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
    available: (env = process.env, profile) => checkAvailability(env, profile),
    run: (input, env = process.env, profile) => drive(input, env, profile),
    async liveProbe(env = process.env, profile): Promise<LiveProbeResult> {
      const model = env.QUANTUM_MODEL || REGISTRY["openai-agents"].defaultModel;
      const a = await checkAvailability(env, profile);
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
        profile,
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
