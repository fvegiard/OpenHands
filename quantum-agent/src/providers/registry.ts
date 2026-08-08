// Provider-neutral runtime registry.
//
// Quantum's default runtime is Claude via @anthropic-ai/claude-agent-sdk. That
// SDK only speaks to Claude models (through Anthropic, Bedrock, Vertex, or
// Foundry) — swapping in an OpenAI/Gemini/OpenRouter key does NOT make it run
// those models. To run non-Claude models we expose additional *runtimes* built
// on their own official SDKs, selected explicitly via env vars or `provider
// select`. Optional runtimes are discoverable but not bundled: when the package
// or secret is missing we report the exact package/secret needed instead of
// silently falling back.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { getPaths } from "../config.ts";

/** The concrete agent runtimes Quantum knows how to drive. */
export const RuntimeId = z.enum(["claude", "openai-agents", "codex"]);
export type RuntimeId = z.infer<typeof RuntimeId>;

/** Capabilities we track per runtime (see `provider status`). */
export const CAPABILITIES = [
  "tools",
  "sessions",
  "skills",
  "mcp",
  "permissions",
  "resume",
  "streaming",
  "structuredOutput",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Env-driven configuration, parsed at the boundary with Zod (no silent coercion). */
export const RuntimeConfigSchema = z.object({
  runtime: RuntimeId,
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export interface RuntimeSpec {
  readonly id: RuntimeId;
  readonly title: string;
  /** npm packages that must be importable for this runtime to run. */
  readonly npmPackages: readonly string[];
  /** Acceptable secret env var names (any one satisfies the runtime). */
  readonly secretEnv: readonly string[];
  /** Provider backends this runtime can target. */
  readonly providers: readonly string[];
  readonly defaultModel: string;
  /** Unattended (non-interactive) permission mode for this runtime. */
  readonly unattendedPermissionMode: string;
  readonly capabilities: Readonly<Record<Capability, boolean>>;
  /** True when the runtime can only ever run Claude models. */
  readonly claudeCoupled: boolean;
}

const ALL: Capability[] = [...CAPABILITIES];
function caps(on: Capability[]): Record<Capability, boolean> {
  const out = {} as Record<Capability, boolean>;
  for (const c of ALL) out[c] = on.includes(c);
  return out;
}

/**
 * The runtime registry. `claude` is bundled; the rest are discoverable and
 * report the exact package + secret they need. Capability flags for the
 * optional runtimes are source-backed (from each SDK's docs) and are only
 * confirmed live once the package + secret are present.
 */
export const REGISTRY: Readonly<Record<RuntimeId, RuntimeSpec>> = {
  claude: {
    id: "claude",
    title: "Claude Agent SDK (native)",
    npmPackages: ["@anthropic-ai/claude-agent-sdk"],
    secretEnv: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    providers: ["anthropic", "bedrock", "vertex", "foundry"],
    defaultModel: "claude-opus-4-7",
    unattendedPermissionMode: "bypassPermissions",
    capabilities: caps([...ALL]),
    claudeCoupled: true,
  },
  "openai-agents": {
    id: "openai-agents",
    title: "OpenAI Agents SDK (provider-neutral via ai-sdk adapter)",
    npmPackages: ["@openai/agents", "@openai/agents-extensions"],
    secretEnv: ["OPENAI_API_KEY"],
    providers: ["openai", "openai-compatible", "vercel-ai-sdk"],
    defaultModel: "gpt-5.1",
    unattendedPermissionMode: "auto-approve-tools",
    capabilities: caps(["tools", "sessions", "mcp", "streaming", "structuredOutput", "resume"]),
    claudeCoupled: false,
  },
  codex: {
    id: "codex",
    title: "OpenAI Codex SDK (coding-agent runtime)",
    npmPackages: ["@openai/codex-sdk"],
    secretEnv: ["OPENAI_API_KEY", "CODEX_API_KEY"],
    providers: ["openai"],
    defaultModel: "gpt-5.1-codex",
    unattendedPermissionMode: "danger-full-access;approval=never",
    capabilities: caps(["tools", "sessions", "permissions", "resume", "streaming"]),
    claudeCoupled: false,
  },
};

export interface RuntimeStatus {
  readonly id: RuntimeId;
  readonly title: string;
  readonly selected: boolean;
  readonly installed: boolean;
  readonly missingPackages: string[];
  readonly secretPresent: boolean;
  readonly secretEnvChecked: readonly string[];
  readonly missingSecretNames: readonly string[];
  /** Contract-ready: package importable AND a secret is present. */
  readonly ready: boolean;
  readonly model: string;
  readonly diagnostic: string;
}

async function isImportable(pkg: string): Promise<boolean> {
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}

/** Which of a runtime's accepted secret env vars are set (names only). */
function presentSecrets(
  spec: RuntimeSpec,
  env: NodeJS.ProcessEnv,
): { present: string[]; missing: string[] } {
  const present = spec.secretEnv.filter((name) => {
    const v = env[name];
    return typeof v === "string" && v.length > 0;
  });
  return { present: [...present], missing: present.length > 0 ? [] : [...spec.secretEnv] };
}

export async function runtimeStatus(
  id: RuntimeId,
  selectedId: RuntimeId,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeStatus> {
  const spec = REGISTRY[id];
  const missingPackages: string[] = [];
  for (const pkg of spec.npmPackages) {
    if (!(await isImportable(pkg))) missingPackages.push(pkg);
  }
  const installed = missingPackages.length === 0;
  const { present, missing } = presentSecrets(spec, env);
  const secretPresent = present.length > 0;
  const ready = installed && secretPresent;
  const model = env.QUANTUM_MODEL ?? spec.defaultModel;

  let diagnostic: string;
  if (!installed) {
    diagnostic =
      `install: pnpm add ${missingPackages.join(" ")}` +
      (secretPresent ? "" : `  then set one of: ${spec.secretEnv.join(", ")}`);
  } else if (!secretPresent) {
    diagnostic = `set one of these Cursor Secrets: ${spec.secretEnv.join(", ")} (live calls only)`;
  } else {
    diagnostic = "ready (package installed, secret present)";
  }

  return {
    id,
    title: spec.title,
    selected: id === selectedId,
    installed,
    missingPackages,
    secretPresent,
    secretEnvChecked: spec.secretEnv,
    missingSecretNames: missing,
    ready,
    model,
    diagnostic,
  };
}

function selectionFile(): string {
  return join(getPaths().root, "runtime.json");
}

/** Persisted selection (used when env vars are not set). */
function readPersisted(): Partial<RuntimeConfig> {
  try {
    const raw = readFileSync(selectionFile(), "utf8");
    const parsed = RuntimeConfigSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the active runtime config. Precedence: explicit env vars, then a
 * persisted `provider select`, then the bundled `claude` default. Throws a
 * precise error on an invalid runtime id (no silent fallback).
 */
export function resolveRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const persisted = readPersisted();
  // Treat an empty env var as unset (|| not ??) so `QUANTUM_RUNTIME=` behaves
  // like "default", not an invalid id. A non-empty invalid id still throws.
  const rawRuntime = env.QUANTUM_RUNTIME || persisted.runtime || "claude";
  const parsedId = RuntimeId.safeParse(rawRuntime);
  if (!parsedId.success) {
    const allowed = RuntimeId.options.join(", ");
    throw new Error(
      `invalid QUANTUM_RUNTIME='${rawRuntime}'. Allowed runtimes: ${allowed}. ` +
        "No silent fallback — set QUANTUM_RUNTIME or run `quantum provider select <runtime>`.",
    );
  }
  const runtime = parsedId.data;
  const provider = env.QUANTUM_PROVIDER || persisted.provider;
  const model = env.QUANTUM_MODEL || persisted.model || REGISTRY[runtime].defaultModel;
  return RuntimeConfigSchema.parse({ runtime, provider, model });
}

export function persistSelection(config: RuntimeConfig): string {
  const file = selectionFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

/** Validate a provider name against the selected runtime's supported backends. */
export function validateProvider(runtime: RuntimeId, provider: string | undefined): string | null {
  if (!provider) return null;
  const spec = REGISTRY[runtime];
  if (!spec.providers.includes(provider)) {
    return (
      `provider '${provider}' is not supported by runtime '${runtime}'. ` +
      `Supported: ${spec.providers.join(", ")}`
    );
  }
  return null;
}

export interface ProviderTestResult {
  readonly ok: boolean;
  readonly runtime: RuntimeId;
  readonly model: string;
  readonly kind: "live" | "contract";
  readonly message: string;
}

/**
 * Test the selected runtime. Runs a live check only when a matching secret
 * already exists; otherwise runs a strict contract check (package importable?)
 * and reports the exact missing secret name. Never performs a silent fallback:
 * an unavailable package fails.
 */
export async function providerTest(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderTestResult> {
  const status = await runtimeStatus(config.runtime, config.runtime, env);
  const providerErr = validateProvider(config.runtime, config.provider);
  if (providerErr) {
    return {
      ok: false,
      runtime: config.runtime,
      model: config.model ?? status.model,
      kind: "contract",
      message: providerErr,
    };
  }
  if (!status.installed) {
    return {
      ok: false,
      runtime: config.runtime,
      model: config.model ?? status.model,
      kind: "contract",
      message: `runtime not installed. ${status.diagnostic}`,
    };
  }
  // Contract test only: this NEVER performs a call, so it never reports a live
  // result. A real call is the opt-in `provider test --live` path, which uses
  // the runtime adapter's liveProbe(). Claiming kind="live" here without a call
  // would be an unsupported success claim.
  const secretHint = status.secretPresent
    ? `a secret in [${status.secretEnvChecked.join(", ")}] is set; run 'provider test --live' for a real call`
    : `set one of [${status.secretEnvChecked.join(", ")}] then 'provider test --live' for a real call`;
  return {
    ok: true,
    runtime: config.runtime,
    model: config.model ?? status.model,
    kind: "contract",
    message: `contract PASS (package installed). ${secretHint}.`,
  };
}
