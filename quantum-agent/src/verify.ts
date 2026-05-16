// `quantum verify` — README is the spec. Parses every fenced bash block
// in README.md and validates that each line invokes a known `quantum`
// subcommand. Exits non-zero on drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const KNOWN_SUBCOMMANDS = new Set([
  "doctor",
  "init",
  "run",
  "chat",
  "tui",
  "see",
  "listen",
  "verify",
  "serve",
  "watch",
  "skill",
  "agent",
  "tool",
  "cache",
  "autoupdate",
]);

const NON_QUANTUM_OK = new Set([
  "mise",
  "pnpm",
  "cp",
  "echo",
  "docker",
  "curl",
  "git",
  "claude",
  "node",
  "npx",
]);

export interface VerifyReport {
  ok: boolean;
  totalBlocks: number;
  totalLines: number;
  unknown: { line: string; reason: string }[];
}

export function extractBashBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:bash|sh)\n([\s\S]*?)\n```/g;
  for (const match of md.matchAll(re)) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

export function verifyReadme(readmePath = join(process.cwd(), "README.md")): VerifyReport {
  const md = readFileSync(readmePath, "utf8");
  const blocks = extractBashBlocks(md);
  const unknown: VerifyReport["unknown"] = [];
  let totalLines = 0;
  for (const block of blocks) {
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      totalLines += 1;
      // Strip env prefixes (X=Y).
      const stripped = line.replace(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/i, "");
      // Strip pipelines & subshells.
      const head = stripped.split(/\s|[|&;()<>]/)[0] ?? "";
      if (!head) continue;
      if (head === "quantum") {
        const sub = stripped.split(/\s+/)[1];
        if (!sub || !KNOWN_SUBCOMMANDS.has(sub)) {
          unknown.push({ line, reason: `unknown quantum subcommand: ${sub}` });
        }
        continue;
      }
      if (NON_QUANTUM_OK.has(head)) continue;
      unknown.push({ line, reason: `unknown command head: ${head}` });
    }
  }
  return { ok: unknown.length === 0, totalBlocks: blocks.length, totalLines, unknown };
}
