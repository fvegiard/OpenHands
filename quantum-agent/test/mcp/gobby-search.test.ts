// Tests for the gobby codebase-search MCP server.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGobbyToolset,
  index,
  runCdpDiscover,
  runFindRefs,
  runIndex,
  runSearch,
} from "../../src/mcp/gobby-search.ts";

const TEST_DIR_NAME = `gobby-test-${Date.now()}`;
const TEST_ROOT = join(process.cwd(), ".test-fixtures", TEST_DIR_NAME);

function makeRepo(): string {
  mkdirSync(TEST_ROOT, { recursive: true });
  writeFileSync(
    join(TEST_ROOT, "utils.ts"),
    `export function hello(name: string): string { return "hi " + name; }\nexport class Counter { private n = 0; inc() { this.n++; } }\n`,
    "utf8",
  );
  writeFileSync(
    join(TEST_ROOT, "main.ts"),
    `import { hello } from "./utils";\nconst msg = hello("world");\nconsole.log(msg);\n`,
    "utf8",
  );
  writeFileSync(
    join(TEST_ROOT, "README.md"),
    `# gobby test repo\nThis is a test for the gobby search index.\n`,
    "utf8",
  );
  return TEST_ROOT;
}

function cleanup(): void {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function resetIndex(): void {
  index.files.clear();
  index.root = process.cwd();
  index.indexedAt = "";
}

describe("gobby index_repo", () => {
  it("indexes a repo and returns file/symbol counts", async () => {
    cleanup();
    resetIndex();
    const root = makeRepo();
    const r = await runIndex({ root });
    cleanup();
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("Indexed");
    expect(r.content[0]!.text).toContain("files");
  });

  it("rejects paths that escape the project root", async () => {
    cleanup();
    resetIndex();
    const r = await runIndex({ root: "/etc" });
    cleanup();
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/escapes|error/i);
  });
});

describe("gobby search_code", () => {
  it("finds symbols and lines matching a query", async () => {
    cleanup();
    resetIndex();
    const root = makeRepo();
    await runIndex({ root });
    cleanup();
    const r = await runSearch({ query: "hello", limit: 5 });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("hello");
  });

  it("returns an error when index is empty", async () => {
    cleanup();
    resetIndex();
    const r = await runSearch({ query: "hello" });
    cleanup();
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("empty");
  });
});

describe("gobby find_references", () => {
  it("finds all references to an exported symbol", async () => {
    cleanup();
    resetIndex();
    const root = makeRepo();
    await runIndex({ root });
    cleanup();
    const r = await runFindRefs({ symbol: "hello", limit: 10 });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("hello");
  });

  it("returns a no-results message for unknown symbols", async () => {
    cleanup();
    resetIndex();
    const root = makeRepo();
    await runIndex({ root });
    cleanup();
    const r = await runFindRefs({ symbol: "nonexistent_xyz_999" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("No references");
  });
});

describe("gobby cdp_discover", () => {
  it("returns a message when no CDP targets are found", async () => {
    const r = await runCdpDiscover({ portStart: 9222, portEnd: 9222, wsTimeoutMs: 500 });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toContain("No CDP targets");
  });
});

describe("buildGobbyToolset", () => {
  it("registers 4 tools when SDK is available", async () => {
    const ts = await buildGobbyToolset();
    expect(ts.toolNames).toEqual(["index_repo", "search_code", "find_references", "cdp_discover"]);
  });
});
