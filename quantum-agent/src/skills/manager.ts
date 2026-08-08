// Skill manager — install / search / list / update / translate / pack.
// Source-specific drivers live under sources/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { discover, loadBody, type SkillBody, type SkillManifest } from "./loader.ts";
import { findPack, type Pack, parseSourcesFile } from "./sources.ts";
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

/** Load a skill (manifest + body) by its frontmatter `name`, or null. */
export function loadSkillByName(name: string): SkillBody | null {
  const m = listInstalled().find((s) => s.frontmatter.name === name);
  return m ? loadBody(m) : null;
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
      // Never block on a credential prompt: without this, a private/missing
      // repo makes `git clone` hang until the timeout on Windows (Git Credential
      // Manager pops an interactive prompt), which fails the pack:default test.
      // With prompts disabled git fails fast and we write the offline placeholder.
      env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GCM_INTERACTIVE: "never" },
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
  const { sources, packs: tomlPacks } = parseSourcesFile();
  const externalPacks: Pack[] = [...tomlPacks];
  for (const s of sources) {
    if (s.type === "git" && s.url) {
      const m = s.url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
      if (m?.[1]) externalPacks.push({ name: s.name, specs: [`gh:${m[1]}`] });
    }
  }
  const pack = findPack(name, externalPacks);
  if (!pack) {
    return { installed: [], skipped: [name], notes: [`unknown pack: ${name}`] };
  }
  // A pack spec can either be a concrete install spec (gh:.. / pack:..) or
  // a reference to another pack name. Resolve up to one indirection level.
  const installed: string[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];
  for (const rawSpec of pack.specs) {
    let spec = rawSpec;
    if (!spec.startsWith("gh:") && !spec.startsWith("pack:")) {
      const referenced = findPack(spec, externalPacks);
      if (referenced) spec = `pack:${spec}`;
    }
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

export interface SyncResult {
  target: string;
  written: string[];
  source: string;
}

/**
 * Expose the canonical skills-core skills to Cursor Cloud agents through the
 * `.agents/skills` convention. `skills-core/` stays the single source of truth;
 * each `.agents/skills/<name>/SKILL.md` is a regenerated in-sync copy carrying a
 * provenance banner (not a symlink, not a hand-edited divergent duplicate).
 * Re-run after editing a source skill.
 */
export function syncSkills(
  target = resolve(process.cwd(), "..", ".agents", "skills"),
  sourceDir = "./skills-core",
): SyncResult {
  const written: string[] = [];
  const manifests = discover([sourceDir]);
  for (const m of manifests) {
    const name = m.frontmatter.name;
    if (!name || name === "unknown") continue;
    const raw = readFileSync(m.path, "utf8");
    const fmEnd = raw.indexOf("\n---", 3);
    if (fmEnd === -1) continue;
    const head = raw.slice(0, fmEnd + 4); // through the closing '---'
    const body = raw.slice(fmEnd + 4);
    const banner =
      `\n\n> Generated from \`quantum-agent/${sourceDir.replace(/^\.\//, "")}/${name}/SKILL.md\`` +
      " by `quantum skill sync`. Edit the source, not this copy.\n";
    const dest = join(target, name);
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "SKILL.md"), head + banner + body);
    written.push(join(dest, "SKILL.md"));
  }
  return { target, written, source: sourceDir };
}

export function translateSkill(name: string, to: TargetFormat): string {
  const m = listInstalled().find((s) => s.frontmatter.name === name);
  if (!m) throw new Error(`skill not found: ${name}`);
  return translate(m, to);
}
