// Source driver: `gh:owner/repo` and `https://…/skills.tgz`.
// Thin wrapper over git CLI; offline-safe (returns empty list rather than
// throwing).

import { execa } from "execa";
import { existsSync } from "node:fs";

export async function fetchGit(repo: string, dest: string): Promise<{ ok: boolean; reason: string }> {
  if (existsSync(dest)) return { ok: true, reason: "already present" };
  try {
    await execa("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, dest], {
      timeout: 120_000,
    });
    return { ok: true, reason: "cloned" };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
