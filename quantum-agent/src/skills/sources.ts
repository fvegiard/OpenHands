// Resolve `quantum skill install --pack <name>` through `skills.sources.toml`.
// Supports three source types: skillkit (CLI shellout), http (REST), git
// (clone). Each pack is a curated list of skill specs (gh:owner/repo or names).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SourceType = "skillkit" | "http" | "git" | "local";

export interface Source {
  name: string;
  type: SourceType;
  description?: string;
  command?: string;
  url?: string;
}

export interface Pack {
  name: string;
  specs: string[];
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

/**
 * Parse `skills.sources.toml`. We accept a minimal subset:
 *   [[source]]
 *   name = "..."
 *   type = "..."
 *   url  = "..."
 * Anything richer falls through to defaults — never throws.
 */
export function parseSources(path = DEFAULT_SOURCES_FILE): Source[] {
  const full = join(process.cwd(), path);
  if (!existsSync(full)) return [];
  const raw = readFileSync(full, "utf8");
  const blocks = raw.split(/^\[\[source\]\]\s*$/m).slice(1);
  const out: Source[] = [];
  for (const block of blocks) {
    const fields: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const m = line.match(/^\s*([a-z_]+)\s*=\s*"([^"]+)"\s*$/);
      if (m?.[1] && m?.[2]) fields[m[1]] = m[2];
    }
    if (fields.name && fields.type) {
      out.push({
        name: fields.name,
        type: fields.type as SourceType,
        description: fields.description,
        command: fields.command,
        url: fields.url,
      });
    }
  }
  return out;
}

export function findPack(name: string, extra: Pack[] = []): Pack | null {
  return [...BUILTIN_PACKS, ...extra].find((p) => p.name === name) ?? null;
}
