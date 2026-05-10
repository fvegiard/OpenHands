// Safety hooks: PreToolUse blocks destructive actions outside the project,
// PostToolUse logs every tool call to .quantum/audit.log for replay/debug.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getPaths } from "./config.ts";

const HARD_DENY = [
  /\brm\s+-rf\s+\/(?!\w)/i,
  /:\(\)\s*\{/, // fork bomb
  /\bmkfs(\.|\s)/i,
  /\bdd\s+if=.*of=\/dev\/[sh]d/i,
  /\bgit\s+push\s+(-f|--force)\s+.*\b(main|master)\b/i,
];

const CONFIRM_PATTERNS = [/\brm\s+-rf?\s+/i, /\bgit\s+push\s+(-f|--force)/i];

function ensureAuditDir(): string {
  const path = getPaths().audit;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path;
}

function audit(kind: string, payload: unknown): void {
  const path = ensureAuditDir();
  appendFileSync(path, `${JSON.stringify({ t: Date.now(), kind, payload })}\n`);
}

interface PreToolInput {
  tool_name?: string;
  tool_input?: { command?: string; [k: string]: unknown };
}

export function evaluatePre(input: PreToolInput): { decision: "allow" | "block"; reason?: string } {
  audit("pre", input);
  const cmd = String(input?.tool_input?.command ?? "");
  if (cmd) {
    for (const re of HARD_DENY) {
      if (re.test(cmd)) return { decision: "block", reason: `Quantum policy hard-deny: ${re}` };
    }
  }
  return { decision: "allow" };
}

export function buildHooks(): any {
  return {
    PreToolUse: [
      {
        hooks: [
          async (input: PreToolInput) => {
            const verdict = evaluatePre(input);
            if (verdict.decision === "block") {
              return { decision: "block", reason: verdict.reason };
            }
            return {};
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          async (input: unknown) => {
            audit("post", input);
            return {};
          },
        ],
      },
    ],
  };
}

export const _testing = { HARD_DENY, CONFIRM_PATTERNS };
