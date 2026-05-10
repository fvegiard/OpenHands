// Auto git helpers: stash, commit, push. Used by selfheal between attempts.

import { execa } from "execa";

export async function autoStash(): Promise<{ stashed: boolean }> {
  const r = await execa("git", ["stash", "push", "-u", "-m", `quantum-${Date.now()}`], {
    reject: false,
  });
  return { stashed: r.exitCode === 0 && !/No local changes/.test(r.stdout) };
}

export async function autoCommit(message: string): Promise<{ ok: boolean; sha?: string }> {
  await execa("git", ["add", "-A"], { reject: false });
  const r = await execa("git", ["commit", "-m", message], { reject: false });
  if (r.exitCode !== 0) return { ok: false };
  const sha = (await execa("git", ["rev-parse", "HEAD"], { reject: false })).stdout.trim();
  return { ok: true, sha };
}
