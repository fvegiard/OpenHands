// Skill manager — install / search / list / update / translate / pack.
// Source-specific drivers live under sources/.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execa } from "execa";
import {
  discover,
  isPlaceholder,
  loadBody,
  loadManifest,
  type SkillBody,
  type SkillManifest,
} from "./loader.ts";
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
  /** Real, activatable skills only (a placeholder is NEVER listed here). */
  installed: string[];
  /** Already-present or intentionally-not-installed specs. */
  skipped: string[];
  /** Offline drafts written under `.drafts/` — NOT_VERIFIED, never active. */
  placeholders: string[];
  /** Specs whose clone genuinely failed (precise reason in notes). */
  failed: string[];
  notes: string[];
  /** False when any spec failed to install (drives a nonzero CLI exit). */
  ok: boolean;
}

function emptyResult(): InstallResult {
  return { installed: [], skipped: [], placeholders: [], failed: [], notes: [], ok: true };
}

/** A git cloner — injectable so install tests are hermetic (no real network). */
export type Cloner = (repo: string, dest: string) => Promise<void>;

const realClone: Cloner = async (repo, dest) => {
  await execa("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, dest], {
    timeout: 120_000,
    // Never block on a credential prompt: a private/missing repo otherwise hangs
    // until timeout (Git Credential Manager). With prompts disabled git fails
    // fast and we report a precise failure (never a fake placeholder-as-installed).
    env: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GCM_INTERACTIVE: "never" },
  });
};

/** Write an OFFLINE placeholder under `.drafts/` (dot-dir => never discovered).
 * Marked `status: placeholder` so it can never be treated as an active skill. */
function writeOfflinePlaceholder(repo: string, target: string): string {
  const dest = join(target, ".drafts", repo.replace(/[^a-z0-9._-]/gi, "-"));
  ensureDir(dest);
  writeFileSync(
    join(dest, "SKILL.md"),
    `---\nname: ${repo.replace(/.*\//, "")}\nstatus: placeholder\ndescription: NOT_VERIFIED offline placeholder for ${repo}\n---\n# ${repo}\n\n` +
      `This is a placeholder, not an installed skill. Re-run \`quantum skill install gh:${repo}\` with network access.\n`,
  );
  return dest;
}

/** Valid, activatable skills found under `dest` — the SKILL.md at its root and/or
 * one level down — excluding placeholders and unnamed/"unknown" manifests. Used
 * as the ONLY success signal for an install (a bare directory is never enough). */
function activatableSkills(dest: string): SkillManifest[] {
  const out: SkillManifest[] = [];
  const root = loadManifest(dest);
  if (root && !isPlaceholder(root)) out.push(root);
  out.push(...discover([dest]));
  return out.filter(
    (m) => !!m.frontmatter.name && m.frontmatter.name !== "unknown" && !isPlaceholder(m),
  );
}

/** Skip the network clone (hermetic/deterministic) when explicitly requested. */
function offlineSkills(): boolean {
  const v = process.env.QUANTUM_SKILLS_OFFLINE;
  return v === "1" || v === "true";
}

async function installGh(spec: string, target: string, cloner: Cloner): Promise<InstallResult> {
  const repo = spec.slice(3);
  const dest = join(target, repo.replace(/[^a-z0-9._-]/gi, "-"));
  if (existsSync(dest)) {
    return { ...emptyResult(), skipped: [dest], notes: [`already installed: ${dest}`] };
  }
  // Offline mode: never touch the network AND never claim success. The draft is
  // reported as a placeholder (NOT_VERIFIED), not under installed[].
  if (offlineSkills()) {
    const draft = writeOfflinePlaceholder(repo, target);
    return {
      ...emptyResult(),
      placeholders: [draft],
      notes: [`offline: NOT_VERIFIED placeholder for ${repo} (not installed, not active)`],
    };
  }
  try {
    await cloner(repo, dest);
    // Fail closed unless the clone yielded at least one VALID, ACTIVATABLE skill.
    // `existsSync(dest)` is always true after a clone, so it can never be the
    // success signal — we require a real SKILL.md (root or one level down) with a
    // usable name (not a placeholder, not "unknown").
    const found = activatableSkills(dest);
    if (found.length === 0) {
      try {
        rmSync(dest, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
      return {
        ...emptyResult(),
        failed: [spec],
        ok: false,
        notes: [`clone produced no activatable SKILL.md for ${repo}`],
      };
    }
    return {
      ...emptyResult(),
      installed: [dest],
      notes: [`installed ${repo} (${found.length} activatable skill(s))`],
    };
  } catch (err) {
    // Clone genuinely failed (unavailable / private / bad repo). Remove any
    // partial directory and report a precise, nonzero failure. NEVER write a
    // placeholder into installed[] — that would be a fabricated success.
    try {
      rmSync(dest, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
    return {
      ...emptyResult(),
      failed: [spec],
      ok: false,
      notes: [`git clone failed for ${repo}: ${(err as Error).message}`],
    };
  }
}

function mergeResults(target: InstallResult, r: InstallResult): void {
  target.installed.push(...r.installed);
  target.skipped.push(...r.skipped);
  target.placeholders.push(...r.placeholders);
  target.failed.push(...r.failed);
  target.notes.push(...r.notes);
  if (!r.ok) target.ok = false;
}

async function installPack(name: string, target: string, cloner: Cloner): Promise<InstallResult> {
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
    return { ...emptyResult(), skipped: [name], ok: false, notes: [`unknown pack: ${name}`] };
  }
  // A pack spec can either be a concrete install spec (gh:.. / pack:..) or
  // a reference to another pack name. Resolve up to one indirection level.
  const out = emptyResult();
  for (const rawSpec of pack.specs) {
    let spec = rawSpec;
    if (!spec.startsWith("gh:") && !spec.startsWith("pack:")) {
      const referenced = findPack(spec, externalPacks);
      if (referenced) spec = `pack:${spec}`;
    }
    mergeResults(out, await install(spec, target, cloner));
  }
  out.notes.push(`pack=${pack.name} (${pack.specs.length} specs)`);
  return out;
}

export async function install(
  spec: string,
  target = "./skills",
  cloner: Cloner = realClone,
): Promise<InstallResult> {
  ensureDir(target);
  if (spec.startsWith("gh:")) return installGh(spec, target, cloner);
  if (spec.startsWith("--pack")) {
    const name = spec.replace(/^--pack[=\s]+/, "").trim() || "default";
    return installPack(name, target, cloner);
  }
  if (spec.startsWith("pack:")) return installPack(spec.slice(5), target, cloner);
  return {
    ...emptyResult(),
    skipped: [spec],
    ok: false,
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
 * each `.agents/skills/<name>` directory is a regenerated in-sync copy carrying
 * a provenance banner in SKILL.md (not a symlink or divergent duplicate).
 * Supporting scripts, references, assets, and agent metadata are copied too.
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
    const source = dirname(m.path);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || basename(source) !== name) {
      throw new Error(`unsafe or mismatched skill name: ${name}`);
    }
    const raw = readFileSync(m.path, "utf8");
    const fmEnd = raw.indexOf("\n---", 3);
    if (fmEnd === -1) continue;
    const head = raw.slice(0, fmEnd + 4); // through the closing '---'
    const body = raw.slice(fmEnd + 4);
    const banner =
      `\n\n> Generated from \`quantum-agent/${sourceDir.replace(/^\.\//, "")}/${name}/SKILL.md\`` +
      " by `quantum skill sync`. Edit the source, not this copy.\n";
    const dest = join(target, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(source, dest, { recursive: true, dereference: true });
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
