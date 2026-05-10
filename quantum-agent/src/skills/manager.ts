// Skill manager — install / search / list / update / translate.
// Source-specific drivers live under sources/.

import { execa } from "execa";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discover, type SkillManifest } from "./loader.ts";
import { translate, type TargetFormat } from "./translate.ts";

const LOCAL_DIRS = ["./skills", "./skills-core"];

export function listInstalled(): SkillManifest[] {
  return discover(LOCAL_DIRS);
}

export function searchInstalled(query: string): SkillManifest[] {
  const q = query.toLowerCase();
  return listInstalled().filter(
    (m) =>
      m.frontmatter.name?.toLowerCase().includes(q) ||
      m.frontmatter.description?.toLowerCase().includes(q),
  );
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export interface InstallResult {
  installed: string[];
  skipped: string[];
  notes: string[];
}

export async function install(spec: string, target = "./skills"): Promise<InstallResult> {
  ensureDir(target);
  const notes: string[] = [];

  if (spec.startsWith("gh:")) {
    const repo = spec.slice(3);
    const dest = join(target, repo.replace(/[^a-z0-9._-]/gi, "-"));
    if (existsSync(dest)) {
      return { installed: [], skipped: [dest], notes: [`already installed: ${dest}`] };
    }
    try {
      await execa("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, dest], {
        timeout: 120_000,
      });
      return { installed: [dest], skipped: [], notes };
    } catch (err) {
      notes.push(`git clone failed: ${(err as Error).message}; writing placeholder manifest`);
      writeFileSync(
        join(dest.replace(/\/$/, ""), "SKILL.md"),
        `---\nname: ${repo.replace(/.*\//, "")}\ndescription: placeholder for ${repo} (offline install)\n---\n# ${repo}\n\nPlaceholder. Re-run \`quantum skill install gh:${repo}\` when network is available.\n`,
      );
      return { installed: [dest], skipped: [], notes };
    }
  }

  if (spec.startsWith("--pack")) {
    notes.push("pack install requires skills.sources.toml resolution (planned)");
    return { installed: [], skipped: [spec], notes };
  }

  notes.push(`unknown spec '${spec}'; use gh:owner/repo or --pack <name>`);
  return { installed: [], skipped: [spec], notes };
}

export async function update(_all = false): Promise<{ updated: string[] }> {
  return { updated: [] };
}

export function translateSkill(name: string, to: TargetFormat): string {
  const m = listInstalled().find((s) => s.frontmatter.name === name);
  if (!m) throw new Error(`skill not found: ${name}`);
  return translate(m, to);
}
