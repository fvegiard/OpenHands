// Covers two fixes:
//   #4 — `quantum init` actually installs packs (was print-only).
//   #9 — `parseSourcesFile` accepts `type = "filesystem"` and a `[packs]`
//        table (was silently ignored).

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { install } from "../src/skills/manager.ts";
import { parseSourcesFile } from "../src/skills/sources.ts";

// Pack-install resolution is what these tests verify — not live git clones.
// Run hermetically (no network) so they are deterministic and fast on every
// platform (a live clone otherwise exceeds the test timeout on Windows).
// Assertions are unchanged.
beforeAll(() => {
  process.env.QUANTUM_SKILLS_OFFLINE = "1";
});
afterAll(() => {
  delete process.env.QUANTUM_SKILLS_OFFLINE;
});

describe("init / pack install (finding #4)", () => {
  it("install('pack:default') resolves to gh: specs without throwing", async () => {
    const target = mkdtempSync(join(tmpdir(), "quantum-init-"));
    const r = await install("pack:default", target);
    expect(Array.isArray(r.installed)).toBe(true);
    expect(r.notes.some((n) => n.startsWith("pack="))).toBe(true);
  });

  it("install('--pack openclaw-essentials') uses the alias form", async () => {
    const target = mkdtempSync(join(tmpdir(), "quantum-init-pack-"));
    const r = await install("--pack openclaw-essentials", target);
    expect(r.notes.some((n) => n.includes("openclaw-essentials"))).toBe(true);
  });

  it("install('pack:nope') reports unknown gracefully", async () => {
    const target = mkdtempSync(join(tmpdir(), "quantum-init-nope-"));
    const r = await install("pack:nope", target);
    expect(r.notes.some((n) => n.includes("unknown pack"))).toBe(true);
  });
});

describe("sources.toml schema (finding #9)", () => {
  // Each test writes its TOML to a tempfile and passes the absolute path
  // explicitly so we never have to mutate `process.cwd()` (which would
  // pollute other tests running in parallel).
  function makeFixture(): string {
    const tmp = mkdtempSync(join(tmpdir(), "quantum-sources-"));
    const path = join(tmp, "skills.sources.toml");
    writeFileSync(
      path,
      [
        "[[source]]",
        'name        = "local"',
        'type        = "filesystem"',
        'path        = "./skills-core"',
        "",
        "[[source]]",
        'name        = "git-pack"',
        'type        = "git"',
        'url         = "https://github.com/owner/repo"',
        "",
        "[packs]",
        'default = ["claude-code-essentials", "openclaw-essentials"]',
        '"openclaw-essentials" = ["voltagent-openclaw"]',
        "",
      ].join("\n"),
      "utf8",
    );
    return path;
  }

  it('accepts type = "filesystem" (alias for local)', () => {
    const f = parseSourcesFile(makeFixture());
    const local = f.sources.find((s) => s.name === "local");
    expect(local?.type).toBe("local");
    expect(local?.path).toBe("./skills-core");
  });

  it("parses the [packs] table", () => {
    const f = parseSourcesFile(makeFixture());
    const names = f.packs.map((p) => p.name);
    expect(names).toContain("default");
    expect(names).toContain("openclaw-essentials");
    const def = f.packs.find((p) => p.name === "default");
    expect(def?.specs).toEqual(["claude-code-essentials", "openclaw-essentials"]);
  });
});
