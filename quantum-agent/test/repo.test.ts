// Verifies repo-tool path scoping. A bug in the unscoped version would let
// the agent read /etc/passwd via `mcp__quantum__read` even though the
// header comment claimed it was "scoped to project root".

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInsideRoot, runRead } from "../src/tools/repo.ts";

function makeRoot(): string {
  const root = join(tmpdir(), `quantum-repo-test-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "hello.txt"), "hi there", "utf8");
  return root;
}

describe("repo path scoping", () => {
  it("reads a file inside the project root", () => {
    const root = makeRoot();
    const r = runRead({ path: "hello.txt" }, root);
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("hi there");
  });

  it("rejects absolute paths outside the root (e.g. /etc/passwd)", () => {
    const root = makeRoot();
    const r = runRead({ path: "/etc/passwd" }, root);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/escapes project root/);
  });

  it("rejects relative paths that traverse out (..)", () => {
    const root = makeRoot();
    const r = runRead({ path: "../../../etc/passwd" }, root);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/escapes project root/);
  });

  it("resolveInsideRoot exposes the same gate for other tools", () => {
    const root = makeRoot();
    expect(() => resolveInsideRoot("hello.txt", root)).not.toThrow();
    expect(() => resolveInsideRoot("/etc/passwd", root)).toThrow(/escapes/);
  });
});
