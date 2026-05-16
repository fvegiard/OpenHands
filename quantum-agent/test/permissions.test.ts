import { describe, expect, it } from "vitest";
import { buildCanUseTool } from "../src/permissions.ts";

describe("canUseTool policy", () => {
  const root = "/home/user/quantum-test";
  const can = buildCanUseTool({ projectRoot: root });

  it("auto-allows read-only tools", async () => {
    expect(await can("Read", { file_path: "/etc/passwd" })).toEqual({ behavior: "allow" });
    expect(await can("Glob", { pattern: "**/*" })).toEqual({ behavior: "allow" });
    expect(await can("WebSearch", { query: "foo" })).toEqual({ behavior: "allow" });
  });

  it("auto-allows quantum's in-process MCP tools", async () => {
    expect(await can("mcp__quantum__bash", { cmd: "ls" })).toEqual({ behavior: "allow" });
  });

  it("allows edits inside the project root", async () => {
    const r = await can("Edit", { file_path: `${root}/src/foo.ts` });
    expect(r).toEqual({ behavior: "allow" });
  });

  it("denies edits outside the project root", async () => {
    const r = await can("Write", { file_path: "/etc/hosts" });
    expect(r.behavior).toBe("deny");
  });

  it("asks for unknown tools", async () => {
    const r = await can("Unknown.tool", {});
    expect(r).toEqual({ behavior: "ask" });
  });
});
