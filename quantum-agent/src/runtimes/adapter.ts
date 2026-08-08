// Typed runtime adapter boundary.
//
// Each concrete runtime (Claude Agent SDK, OpenAI Agents SDK, OpenAI Codex SDK)
// implements this interface. runAgent() resolves the selected runtime and
// dispatches to exactly one adapter — selecting a runtime changes the code path
// that actually executes, with no silent fallback to another runtime.

import type { RuntimeId } from "../providers/registry.ts";

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
  /** Can this runtime run right now? (package + secret present) */
  available(env?: NodeJS.ProcessEnv): Promise<RuntimeAvailability>;
  /** Execute a prompt. MUST throw (never fall back) if this runtime is unavailable. */
  run(input: RuntimeRunInput, env?: NodeJS.ProcessEnv): Promise<RuntimeRunResult>;
  /** Minimal real call for an explicit --live probe. Returns not_verified if not executed. */
  liveProbe(env?: NodeJS.ProcessEnv): Promise<LiveProbeResult>;
}

/** Load an OPTIONAL runtime SDK by name without a compile-time dependency.
 * Using a string variable specifier keeps tsc from resolving uninstalled
 * optional providers; a failed import returns null (caller reports the exact
 * package to install — never a silent fallback). */
export async function optionalImport(specifier: string): Promise<unknown> {
  try {
    return (await import(specifier)) as unknown;
  } catch {
    return null;
  }
}

export function presentSecret(names: readonly string[], env: NodeJS.ProcessEnv): string | null {
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v.length > 0) return n;
  }
  return null;
}
