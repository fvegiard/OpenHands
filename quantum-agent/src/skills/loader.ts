// Progressive-disclosure SKILL.md loader. Returns the YAML frontmatter
// (small) up front; the body is loaded on first invocation.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SkillFrontmatter {
  name: string;
  description: string;
  "allowed-tools"?: string[];
  "paired-agent"?: string;
  model?: string;
  [key: string]: unknown;
}

export interface SkillManifest {
  dir: string;
  path: string;
  frontmatter: SkillFrontmatter;
}

export interface SkillBody {
  manifest: SkillManifest;
  body: string;
}

function parseFrontmatter(raw: string): { fm: SkillFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { fm: { name: "unknown", description: "" }, body: raw };
  }
  const fmRaw = match[1] ?? "";
  const body = match[2] ?? "";
  const fm: Record<string, unknown> = {};
  for (const line of fmRaw.split("\n")) {
    const [k, ...rest] = line.split(":");
    if (!k || rest.length === 0) continue;
    const valueRaw = rest.join(":").trim();
    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      fm[k.trim()] = valueRaw
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      fm[k.trim()] = valueRaw.replace(/^['"]|['"]$/g, "");
    }
  }
  return { fm: fm as SkillFrontmatter, body };
}

export function loadManifest(dir: string): SkillManifest | null {
  const path = join(dir, "SKILL.md");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const { fm } = parseFrontmatter(raw);
  return { dir, path, frontmatter: fm };
}

export function loadBody(manifest: SkillManifest): SkillBody {
  const raw = readFileSync(manifest.path, "utf8");
  const { body } = parseFrontmatter(raw);
  return { manifest, body };
}

export function discover(roots: string[]): SkillManifest[] {
  const out: SkillManifest[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const dir = join(root, name);
      if (!statSync(dir).isDirectory()) continue;
      const m = loadManifest(dir);
      if (m) out.push(m);
    }
  }
  return out;
}
