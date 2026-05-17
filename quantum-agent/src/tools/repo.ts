// `repo` custom tool — grep / read helpers scoped to a configured project
// root. Paths are resolved against the root and rejected if they escape it
// (defence in depth: even though `buildCanUseTool` auto-allows
// `mcp__quantum__*`, an agent should never be able to read /etc/passwd via
// this tool).

import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { execa } from "execa";
import { z } from "zod";
import type { ToolResult } from "./shell.ts";

export const grepSchema = {
  pattern: z.string(),
  path: z.string().default(".").optional(),
};

/** Resolve a caller-supplied path against the project root; reject escapes. */
export function resolveInsideRoot(p: string, root: string = process.cwd()): string {
  const absRoot = resolve(root);
  const candidate = isAbsolute(p) ? resolve(p) : resolve(absRoot, p);
  const rel = relative(absRoot, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes project root: ${p}`);
  }
  return candidate;
}

export async function runGrep(
  args: { pattern: string; path?: string },
  root: string = process.cwd(),
): Promise<ToolResult> {
  let target: string;
  try {
    target = resolveInsideRoot(args.path ?? ".", root);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
  }
  const r = await execa("grep", ["-rEn", args.pattern, target], {
    reject: false,
    timeout: 30_000,
  });
  return { content: [{ type: "text", text: r.stdout || "(no matches)" }] };
}

export const readSchema = { path: z.string() };

export function runRead(args: { path: string }, root: string = process.cwd()): ToolResult {
  let target: string;
  try {
    target = resolveInsideRoot(args.path, root);
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
  }
  try {
    const text = readFileSync(target, "utf8");
    const sliced = text.length > 64_000 ? `${text.slice(0, 64_000)}\n…[truncated]` : text;
    return { content: [{ type: "text", text: sliced }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: (err as Error).message }],
    };
  }
}
