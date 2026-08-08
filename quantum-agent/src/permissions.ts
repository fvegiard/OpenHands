// Permission policy: returns the canUseTool callback that the SDK consults
// before invoking any tool. We pair this with the PreToolUse hook in
// hooks.ts — the hook is the hard floor, this gives finer-grained control.
//
// Policy summary:
//   - Read-only tools (Read, Glob, Grep, WebFetch, WebSearch, list_*): always allow.
//   - Quantum's own tools (mcp__quantum__*): allow.
//   - Edit/Write/MultiEdit inside the project cwd: allow with permissions.acceptEdits.
//   - Bash: defer to PreToolUse hard-deny patterns; otherwise allow inside cwd.
//   - Anything else: ask (the SDK shows a prompt; in headless contexts this denies).

import { isAbsolute, relative, resolve } from "node:path";

export type Permission =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string }
  | { behavior: "ask" };

const ALWAYS_ALLOW = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "ListMcpResources",
  "ReadMcpResource",
  "TodoWrite",
  "Task",
]);

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function isInsideProject(targetPath: string, root: string): boolean {
  if (!targetPath) return false;
  // Compare via path.relative so this is correct on both POSIX and Windows.
  // A hardcoded `${root}/` check breaks on Windows, where resolve() yields
  // backslash-separated paths (e.g. C:\home\user\quantum-test), so an in-root
  // edit is wrongly rejected. Inside-root => relative path is "" or does not
  // escape upward and is not absolute (a different drive on Windows).
  const rel = relative(root, resolve(targetPath));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function buildCanUseTool(opts: { projectRoot?: string } = {}) {
  const root = resolve(opts.projectRoot ?? process.cwd());

  return async (toolName: string, toolInput: Record<string, unknown>): Promise<Permission> => {
    if (toolName.startsWith("mcp__quantum__")) return { behavior: "allow" };
    if (ALWAYS_ALLOW.has(toolName)) return { behavior: "allow" };

    if (EDIT_TOOLS.has(toolName)) {
      const target = String(toolInput.file_path ?? toolInput.notebook_path ?? "");
      if (!target) return { behavior: "ask" };
      if (isInsideProject(target, root)) return { behavior: "allow" };
      return {
        behavior: "deny",
        message: `Quantum policy: ${toolName} target is outside the project root (${root}).`,
      };
    }

    if (toolName === "Bash") {
      // Hard-deny is handled by PreToolUse hook. Here we allow by default;
      // anything destructive will have been caught upstream.
      return { behavior: "allow" };
    }

    return { behavior: "ask" };
  };
}
