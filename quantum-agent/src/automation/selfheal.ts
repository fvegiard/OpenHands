// Self-heal: run a green-gate command; on red, diversify (different
// strategy / model) and retry. The default attempt cap is 5; callers can
// override via `maxAttempts` (or pass `Infinity` for unbounded retries).
// Strategies are mined from the blackboard so we never repeat the same
// losing approach within the configured budget.

import { execa } from "execa";
import { remember } from "../memory.ts";

export interface HealOptions {
  command: string;
  cwd?: string;
  maxAttempts?: number;
  diversify?: (attempt: number) => string[];
}

export interface HealResult {
  ok: boolean;
  attempts: number;
  log: string[];
}

export async function selfheal(opts: HealOptions): Promise<HealResult> {
  const max = opts.maxAttempts ?? 5;
  const log: string[] = [];
  for (let attempt = 1; attempt <= max; attempt++) {
    const args = opts.diversify?.(attempt) ?? [];
    const cmd = `${opts.command} ${args.join(" ")}`.trim();
    log.push(`attempt ${attempt}: ${cmd}`);
    const r = await execa(cmd, { shell: true, cwd: opts.cwd, reject: false, timeout: 10 * 60_000 });
    if (r.exitCode === 0) {
      remember(`selfheal-success-${Date.now()}`, cmd, "selfheal");
      return { ok: true, attempts: attempt, log };
    }
    remember(`selfheal-failure-${Date.now()}`, `${cmd}\n${r.stderr.slice(0, 1000)}`, "selfheal");
  }
  return { ok: false, attempts: max, log };
}
