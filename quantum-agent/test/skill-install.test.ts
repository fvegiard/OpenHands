// Skill-install honesty (no false success). Uses an injected cloner so tests are
// hermetic (no real network): a failed clone (unavailable/private/bad repo) is a
// precise nonzero failure with the partial dir removed and NEVER counted as
// installed; an offline install writes a NOT_VERIFIED placeholder that is never
// discovered/activated.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover, isPlaceholder, loadManifest } from "../src/skills/loader.ts";
import { type Cloner, install } from "../src/skills/manager.ts";

let target: string;
beforeEach(() => {
  target = mkdtempSync(join(tmpdir(), "qa-install-"));
});
afterEach(() => {
  rmSync(target, { recursive: true, force: true });
  delete process.env.QUANTUM_SKILLS_OFFLINE;
});

const failingClone: Cloner = async () => {
  throw new Error("fatal: repository 'https://github.com/x/y.git/' not found");
};

const successClone: Cloner = async (_repo, dest) => {
  // Simulate a clone that produced a real skill.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dest, { recursive: true });
  writeFileSync(
    join(dest, "SKILL.md"),
    "---\nname: real-skill\ndescription: a real one\n---\n# real\n",
  );
};

const emptyClone: Cloner = async (_repo, dest) => {
  // A clone that "succeeds" but leaves a directory with NO activatable SKILL.md.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dest, { recursive: true });
};

const junkClone: Cloner = async (_repo, dest) => {
  // A clone with files but no valid SKILL.md (e.g. only a README) — not a skill.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "README.md"), "# not a skill\n");
};

describe("skill install — failed clone is a precise failure, never installed", () => {
  it("unavailable/private/bad repo => ok=false, failed listed, no placeholder, partial dir removed", async () => {
    const r = await install("gh:owner/private-repo", target, failingClone);
    expect(r.ok).toBe(false);
    expect(r.installed).toEqual([]);
    expect(r.placeholders).toEqual([]);
    expect(r.failed).toEqual(["gh:owner/private-repo"]);
    expect(r.notes.join(" ")).toMatch(/git clone failed/);
    // No partial directory left behind.
    expect(existsSync(join(target, "owner-private-repo"))).toBe(false);
  });

  it("a successful clone is installed and discoverable (not a placeholder)", async () => {
    const r = await install("gh:owner/good-repo", target, successClone);
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.installed.length).toBe(1);
    const found = discover([target]);
    expect(found.map((m) => m.frontmatter.name)).toContain("real-skill");
  });
});

describe("skill install — offline placeholder is never installed/activated", () => {
  it("offline mode reports a placeholder, not installed, and it is not discovered", async () => {
    process.env.QUANTUM_SKILLS_OFFLINE = "1";
    const r = await install("gh:owner/repo", target, failingClone); // cloner must not run
    expect(r.installed).toEqual([]);
    expect(r.placeholders.length).toBe(1);
    expect(r.notes.join(" ")).toMatch(/NOT_VERIFIED placeholder/);
    // The placeholder lives under .drafts and is never discovered as active.
    expect(discover([target])).toEqual([]);
    // And if loaded directly, it is flagged as a placeholder.
    const draft = r.placeholders[0];
    expect(draft).toBeDefined();
    const m = loadManifest(draft as string);
    expect(m).not.toBeNull();
    if (m) expect(isPlaceholder(m)).toBe(true);
  });
});

describe("skill install — a clone with no activatable SKILL.md fails closed", () => {
  it("empty clone (bare dir) => ok=false, not installed, dir removed", async () => {
    const r = await install("gh:owner/empty", target, emptyClone);
    expect(r.ok).toBe(false);
    expect(r.installed).toEqual([]);
    expect(r.failed).toEqual(["gh:owner/empty"]);
    expect(r.notes.join(" ")).toMatch(/no activatable SKILL\.md/);
    expect(existsSync(join(target, "owner-empty"))).toBe(false);
  });

  it("clone with files but no valid SKILL.md (only README) => ok=false, dir removed", async () => {
    const r = await install("gh:owner/junk", target, junkClone);
    expect(r.ok).toBe(false);
    expect(r.installed).toEqual([]);
    expect(r.failed).toEqual(["gh:owner/junk"]);
    expect(existsSync(join(target, "owner-junk"))).toBe(false);
  });

  it("removes a stale partial clone and retries the install", async () => {
    const stale = join(target, "owner-retry");
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, "README.md"), "# interrupted clone\n");

    const r = await install("gh:owner/retry", target, successClone);

    expect(r.ok).toBe(true);
    expect(r.installed).toEqual([stale]);
    expect(existsSync(join(stale, "SKILL.md"))).toBe(true);
    expect(existsSync(join(stale, "README.md"))).toBe(false);
  });
});

describe("skill install — unknown spec fails closed", () => {
  it("a non gh:/pack: spec is skipped with ok=false", async () => {
    const r = await install("not-a-spec", target, emptyClone);
    expect(r.ok).toBe(false);
    expect(r.skipped).toEqual(["not-a-spec"]);
  });
});
