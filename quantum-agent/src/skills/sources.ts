// Resolve `quantum skill install --pack <name>` through `skills.sources.toml`.
// Supports four source types: skillkit (CLI shellout), http (REST), git
// (clone), and local/filesystem (on-disk discovery). Each pack is a curated
// list of skill specs (gh:owner/repo or pack:<name>) — read from the
// optional `[packs]` table in the TOML.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export type SourceType = "skillkit" | "http" | "git" | "local";

/** Public alias surface so callers reading the TOML can use either spelling. */
export const SOURCE_TYPE_ALIASES: Record<string, SourceType> = {
  skillkit: "skillkit",
  http: "http",
  https: "http",
  rest: "http",
  git: "git",
  github: "git",
  local: "local",
  filesystem: "local",
  fs: "local",
};

export interface Source {
  name: string;
  type: SourceType;
  description?: string;
  command?: string;
  url?: string;
  path?: string;
}

export interface Pack {
  name: string;
  specs: string[];
}

export interface SourcesFile {
  sources: Source[];
  packs: Pack[];
}

const DEFAULT_SOURCES_FILE = "skills.sources.toml";

// Bundled defaults — match the README packs. Real config in skills.sources.toml
// extends/overrides these.
export const BUILTIN_PACKS: Pack[] = [
  {
    name: "default",
    specs: ["gh:anthropics/claude-agent-sdk-demos", "gh:alirezarezvani/claude-skills"],
  },
  {
    name: "claude-code-essentials",
    specs: ["gh:anthropics/claude-code"],
  },
  {
    name: "openclaw-essentials",
    specs: ["gh:VoltAgent/awesome-openclaw-skills"],
  },
  {
    name: "engineering-team",
    specs: ["gh:alirezarezvani/claude-skills"],
  },
];

function normalizeType(raw: string): SourceType | null {
  return SOURCE_TYPE_ALIASES[raw.toLowerCase()] ?? null;
}

function parseScalarFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*"([^"]+)"\s*$/);
    if (m?.[1] && m?.[2]) fields[m[1]] = m[2];
  }
  return fields;
}

function parseArrayValue(raw: string): string[] {
  // ["a", "b", "c"] → ["a", "b", "c"]
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/** Split TOML into pre-packs body + packs body (string handling, not full TOML). */
function splitOnPacks(raw: string): { body: string; packsBody: string | null } {
  const m = raw.match(/^\[packs\]\s*$/m);
  if (!m) return { body: raw, packsBody: null };
  const idx = raw.indexOf(m[0]);
  return {
    body: raw.slice(0, idx),
    packsBody: raw.slice(idx + m[0].length),
  };
}

/**
 * Parse `skills.sources.toml`. Accepts:
 *   [[source]] blocks with name/type/description/command/url/path
 *   [packs] table whose values are arrays of strings (spec list)
 * Unknown source types are dropped (silently — never throws).
 */
export function parseSources(path = DEFAULT_SOURCES_FILE): Source[] {
  return parseSourcesFile(path).sources;
}

export function parseSourcesFile(path = DEFAULT_SOURCES_FILE): SourcesFile {
  // Allow callers to pass an absolute path verbatim (used in tests).
  const full = isAbsolute(path) ? path : join(process.cwd(), path);
  if (!existsSync(full)) return { sources: [], packs: [] };
  const raw = readFileSync(full, "utf8");
  const { body, packsBody } = splitOnPacks(raw);

  const blocks = body.split(/^\[\[source\]\]\s*$/m).slice(1);
  const sources: Source[] = [];
  for (const block of blocks) {
    const fields = parseScalarFields(block);
    const t = fields.type ? normalizeType(fields.type) : null;
    if (!fields.name || !t) continue;
    sources.push({
      name: fields.name,
      type: t,
      description: fields.description,
      command: fields.command,
      url: fields.url,
      path: fields.path,
    });
  }

  const packs: Pack[] = [];
  if (packsBody) {
    for (const line of packsBody.split("\n")) {
      const m = line.match(/^\s*("[^"]+"|[a-zA-Z][\w-]*)\s*=\s*(\[.*\])\s*$/);
      if (!m?.[1] || !m?.[2]) continue;
      const name = m[1].replace(/^"|"$/g, "");
      const specs = parseArrayValue(m[2]);
      if (specs.length > 0) packs.push({ name, specs });
    }
  }

  return { sources, packs };
}

export function findPack(name: string, extra: Pack[] = []): Pack | null {
  return [...BUILTIN_PACKS, ...extra].find((p) => p.name === name) ?? null;
}
