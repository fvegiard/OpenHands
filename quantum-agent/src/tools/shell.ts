// `bash` custom tool — safe shell with allow/deny patterns.

import { execa } from "execa";
import { z } from "zod";

const DENY = /\brm\s+-rf\s+\/(?!\w)|:\(\)\s*\{|mkfs(\.|\s)|dd\s+if=.*of=\/dev\/[sh]d/i;

export interface ToolResult {
  isError?: boolean;
  content: { type: "text"; text: string }[];
}

export async function runShell(
  cmd: string,
  timeoutMs = 60_000,
  cwd = process.cwd(),
): Promise<ToolResult> {
  if (DENY.test(cmd)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Blocked by Quantum policy." }],
    };
  }
  const r = await execa(cmd, { shell: true, timeout: timeoutMs, reject: false, cwd });
  return {
    content: [
      {
        type: "text",
        text: `exit ${r.exitCode}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
      },
    ],
  };
}

export const shellSchema = {
  cmd: z.string(),
  timeoutMs: z.number().int().positive().optional(),
};
