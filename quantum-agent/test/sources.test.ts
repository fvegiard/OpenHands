import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILTIN_PACKS, findPack, parseSources } from "../src/skills/sources.ts";

describe("skill source resolution", () => {
  it("ships built-in packs", () => {
    expect(BUILTIN_PACKS.map((p) => p.name)).toContain("default");
    expect(BUILTIN_PACKS.map((p) => p.name)).toContain("openclaw-essentials");
  });

  it("findPack returns null for unknown packs", () => {
    expect(findPack("does-not-exist")).toBeNull();
  });

  it("findPack honours extra packs", () => {
    const extra = [{ name: "from-toml", specs: ["gh:x/y"] }];
    expect(findPack("from-toml", extra)?.specs).toEqual(["gh:x/y"]);
  });

  it("parseSources reads [[source]] blocks", () => {
    const dir = mkdtempSync(join(tmpdir(), "quantum-src-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      writeFileSync(
        "skills.sources.toml",
        `# header
[[source]]
name = "skillkit"
type = "skillkit"
command = "skillkit"

[[source]]
name = "clawhub"
type = "http"
url = "https://clawhub.dev/api/v1"
`,
      );
      const sources = parseSources();
      expect(sources.length).toBe(2);
      expect(sources[0]?.name).toBe("skillkit");
      expect(sources[1]?.type).toBe("http");
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parseSources is offline-safe on missing file", () => {
    expect(parseSources("nope.toml")).toEqual([]);
  });
});
