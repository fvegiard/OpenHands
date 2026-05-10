// `repo` custom tool — grep / glob / read helpers scoped to project root.

import { readFileSync } from "node:fs";
import { execa } from "execa";
import { z } from "zod";
import type { ToolResult } from "./shell.ts";

export const grepSchema = {
  pattern: z.string(),
  path: z.string().default(".").optional(),
};

export async function runGrep(args: { pattern: string; path?: string }): Promise<ToolResult> {
  const r = await execa("grep", ["-rEn", args.pattern, args.path ?? "."], {
    reject: false,
    timeout: 30_000,
  });
  return { content: [{ type: "text", text: r.stdout || "(no matches)" }] };
}

export const readSchema = { path: z.string() };

export function runRead(args: { path: string }): ToolResult {
  try {
    const text = readFileSync(args.path, "utf8");
    const sliced = text.length > 64_000 ? `${text.slice(0, 64_000)}\n…[truncated]` : text;
    return { content: [{ type: "text", text: sliced }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: (err as Error).message }],
    };
  }
}
