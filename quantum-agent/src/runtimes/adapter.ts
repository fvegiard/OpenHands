// Typed runtime adapter boundary.
//
// Each concrete runtime (Claude Agent SDK, OpenAI Agents SDK, OpenAI Codex SDK)
// implements this interface. runAgent() resolves the selected runtime and
// dispatches to exactly one adapter — selecting a runtime changes the code path
// that actually executes, with no silent fallback to another runtime.

import { isSafeEnvName, type RuntimeId } from "../providers/registry.ts";

/**
 * The typed provider profile resolved from env + `provider select`. It carries
 * only NAMES/config — never a secret value. Adapters use it to resolve exactly
 * one key (by NAME), the endpoint, the ai-sdk provider package, and a resume id.
 */
export interface RuntimeProfile {
  readonly provider?: string;
  readonly baseUrl?: string;
  /** NAME of the env var holding this profile's key (exact; no fallback). */
  readonly secretEnv?: string;
  /** Vercel AI SDK provider package (e.g. vercel-minimax-ai-provider). */
  readonly providerPackage?: string;
  /** Codex thread id to resume (when the run does not pass --resume). */
  readonly resumeThreadId?: string;
}

export interface RuntimeRunInput {
  readonly prompt: string;
  readonly model: string;
  readonly sessionId: string;
  readonly resume?: string;
  readonly signal?: AbortSignal;
  readonly maxBudgetUsd?: number;
  /** OpenAI-compatible base URL (value from env; never stored). */
  readonly baseUrl?: string;
}

export interface RuntimeUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
}

export interface RuntimeRunResult {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  /** True only for the Claude no-credential mock transport. */
  readonly mock: boolean;
  readonly latencyMs: number;
  readonly usage?: RuntimeUsage;
}

export interface RuntimeAvailability {
  /** True when this runtime can actually execute (package importable + any required secret present). */
  readonly ok: boolean;
  readonly missingPackages: string[];
  readonly missingSecretNames: string[];
  readonly reason: string;
}

export interface LiveProbeResult {
  readonly status: "live" | "not_verified";
  readonly ok: boolean;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs?: number;
  readonly usage?: RuntimeUsage;
  readonly message: string;
}

export interface RuntimeAdapter {
  readonly id: RuntimeId;
  /** Can this runtime run right now? (package + the profile's exact secret present) */
  available(env?: NodeJS.ProcessEnv, profile?: RuntimeProfile): Promise<RuntimeAvailability>;
  /** Execute a prompt. MUST throw (never fall back) if this runtime is unavailable. */
  run(
    input: RuntimeRunInput,
    env?: NodeJS.ProcessEnv,
    profile?: RuntimeProfile,
  ): Promise<RuntimeRunResult>;
  /** Minimal real call for an explicit --live probe. Returns not_verified if not executed. */
  liveProbe(env?: NodeJS.ProcessEnv, profile?: RuntimeProfile): Promise<LiveProbeResult>;
}

/** A module importer — injectable so adapters can be fake-SDK tested. */
export type Importer = (specifier: string) => Promise<unknown>;

/** Load an OPTIONAL runtime SDK by name without a compile-time dependency.
 * Using a string variable specifier keeps tsc from resolving uninstalled
 * optional providers; a failed import returns null (caller reports the exact
 * package to install — never a silent fallback). */
export const optionalImport: Importer = async (specifier: string): Promise<unknown> => {
  try {
    return (await import(specifier)) as unknown;
  } catch {
    return null;
  }
};

/** First present secret NAME (for reporting — never the value). */
export function presentSecret(names: readonly string[], env: NodeJS.ProcessEnv): string | null {
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v.length > 0) return n;
  }
  return null;
}

/** First present secret VALUE (for wiring into an SDK constructor only).
 * The value flows to the runtime SDK and is never logged, printed, or stored. */
export function secretValue(names: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export interface SecretResolution {
  /** Env var NAMES considered (for reporting — never values). */
  readonly names: readonly string[];
  /** The present NAME, or null when none is set. */
  readonly present: string | null;
  /** The resolved VALUE for SDK wiring only (never logged/stored). */
  readonly value: string | undefined;
  /** Set to the offending NAME when an explicit secretEnv fails the safe-name check. */
  readonly invalidName?: string;
}

/**
 * Resolve the key for a runtime with STRICT profile semantics:
 *   - when the profile sets `secretEnv`, resolve EXACTLY `env[secretEnv]` — never
 *     fall back to the runtime defaults (prevents cross-provider key leakage);
 *   - otherwise use the runtime's default NAMES (existing behavior).
 * An invalid `secretEnv` NAME resolves to a value-less result flagged
 * `invalidName` so the caller can fail explicitly.
 */
export function resolveSecret(
  defaults: readonly string[],
  env: NodeJS.ProcessEnv,
  secretEnv?: string,
): SecretResolution {
  if (secretEnv !== undefined) {
    if (!isSafeEnvName(secretEnv)) {
      return { names: [secretEnv], present: null, value: undefined, invalidName: secretEnv };
    }
    const v = env[secretEnv];
    const present = typeof v === "string" && v.length > 0 ? secretEnv : null;
    return { names: [secretEnv], present, value: present ? v : undefined };
  }
  const present = presentSecret(defaults, env);
  return {
    names: [...defaults],
    present,
    value: present ? env[present] : undefined,
  };
}

/** Normalize a model reply for an exact-match probe (e.g. expect "pong"). */
export function normalizeReply(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
}
