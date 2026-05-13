// Skill manager — install / search / list / update / translate / pack.
// Source-specific drivers live under sources/.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { discover, type SkillManifest } from "./loader.ts";
import { findPack, type Pack, parseSources } from "./sources.ts";
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

async function installGh(spec: string, target: string): Promise<InstallResult> {
  const repo = spec.slice(3);
  const dest = join(target, repo.replace(/[^a-z0-9._-]/gi, "-"));
  if (existsSync(dest)) {
    return { installed: [], skipped: [dest], notes: [`already installed: ${dest}`] };
  }
  try {
    await execa("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, dest], {
      timeout: 120_000,
    });
    return { installed: [dest], skipped: [], notes: [] };
  } catch (err) {
    ensureDir(dest);
    writeFileSync(
      join(dest, "SKILL.md"),
      `---\nname: ${repo.replace(/.*\//, "")}\ndescription: placeholder for ${repo} (offline install)\n---\n# ${repo}\n\nRe-run \`quantum skill install gh:${repo}\` when network is available.\n`,
    );
    return {
      installed: [dest],
      skipped: [],
      notes: [`git clone failed (${(err as Error).message}); wrote offline placeholder`],
    };
  }
}

async function installPack(name: string, target: string): Promise<InstallResult> {
  const externalPacks: Pack[] = [];
  const sources = parseSources();
  for (const s of sources) {
    if (s.type === "git" && s.url) {
      const m = s.url.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/i);
      if (m?.[1]) externalPacks.push({ name: s.name, specs: [`gh:${m[1]}`] });
    }
  }
  const pack = findPack(name, externalPacks);
  if (!pack) {
    return { installed: [], skipped: [name], notes: [`unknown pack: ${name}`] };
  }
  const installed: string[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  for (const spec of pack.specs) {
    const r = await install(spec, target);
    installed.push(...r.installed);
    skipped.push(...r.skipped);
    notes.push(...r.notes);
  }
  return {
    installed,
    skipped,
    notes: [...notes, `pack=${pack.name} (${pack.specs.length} specs)`],
  };
}

export async function install(spec: string, target = "./skills"): Promise<InstallResult> {
  ensureDir(target);
  if (spec.startsWith("gh:")) return installGh(spec, target);
  if (spec.startsWith("--pack")) {
    const name = spec.replace(/^--pack[=\s]+/, "").trim() || "default";
    return installPack(name, target);
  }
  if (spec.startsWith("pack:")) return installPack(spec.slice(5), target);
  return {
    installed: [],
    skipped: [spec],
    notes: [`unknown spec '${spec}'; use gh:owner/repo or pack:<name>`],
  };
}

export async function update(_all = false): Promise<{ updated: string[] }> {
  return { updated: [] };
}

export function translateSkill(name: string, to: TargetFormat): string {
  const m = listInstalled().find((s) => s.frontmatter.name === name);
  if (!m) throw new Error(`skill not found: ${name}`);
  return translate(m, to);
}
