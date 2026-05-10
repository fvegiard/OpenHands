// Source driver: shells out to the `skillkit` CLI when present.

import { execa } from "execa";

export async function skillkitInstall(name: string): Promise<{ ok: boolean; reason: string }> {
  try {
    const r = await execa("npx", ["-y", "skillkit", "add", name], {
      timeout: 180_000,
      reject: false,
    });
    return { ok: r.exitCode === 0, reason: r.stdout || r.stderr };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export async function skillkitSearch(query: string): Promise<string[]> {
  try {
    const r = await execa("npx", ["-y", "skillkit", "search", query], {
      timeout: 60_000,
      reject: false,
    });
    return r.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
