// skill activate: DRAFT -> ACTIVE only after format + two fresh-context tests.
// Hermetic unit tests inject the forward-test runner; one smoke uses the REAL
// default runner (a genuine `tsx` subprocess) against a temp draft.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activateSkill, type ForwardTestRunner, isActivated } from "../src/skills/activate.ts";
import { generateSkill } from "../src/skills/generate.ts";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "qa-activate-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const pass: ForwardTestRunner = async () => ({ ok: true, detail: "ok" });
const failSecond: ForwardTestRunner = async (_ctx, t) => ({
  ok: t.id !== "forward-2",
  detail: t.id,
});

function draft(name: string): string {
  const g = generateSkill(`${name} does a nightly thing`, { name, root });
  return join(g.path, "..");
}

describe("skill activate", () => {
  it("a freshly generated skill is a DRAFT (not activated)", () => {
    const dir = draft("nightly-summary");
    expect(isActivated(dir)).toBe(false);
  });

  it("activates after format + BOTH fresh-context tests pass; writes activation.json", async () => {
    const dir = draft("nightly-summary");
    const r = await activateSkill("nightly-summary", { roots: [root], runForwardTest: pass });
    expect(r.activated).toBe(true);
    expect(r.tests.map((t) => t.ok)).toEqual([true, true]);
    expect(isActivated(dir)).toBe(true);
    const state = JSON.parse(readFileSync(join(dir, "activation.json"), "utf8"));
    expect(state.activated).toBe(true);
    expect(state.note).toMatch(/NOT_VERIFIED/); // LLM behavioral test not faked
  });

  it("does NOT activate (explicit) when a fresh-context test fails", async () => {
    const dir = draft("nightly-summary");
    const r = await activateSkill("nightly-summary", { roots: [root], runForwardTest: failSecond });
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/forward test/);
    expect(isActivated(dir)).toBe(false);
  });

  it("does NOT activate when the format is invalid", async () => {
    const dir = draft("nightly-summary");
    // Corrupt the name to an invalid (non-hyphenated) value.
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: Not Valid Name\ndescription: x\n---\n# body that is long enough to pass the length check easily\n",
    );
    const r = await activateSkill("nightly-summary", { roots: [root], runForwardTest: pass });
    // Name no longer matches, so it is not even discoverable as that draft.
    expect(r.activated).toBe(false);
    expect(isActivated(dir)).toBe(false);
  });

  it("does NOT activate a non-existent draft", async () => {
    const r = await activateSkill("no-such-skill", { roots: [root], runForwardTest: pass });
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/no draft/);
  });

  it("REAL fresh-context runner (tsx subprocess) activates a valid draft", async () => {
    const dir = draft("real-fresh-ctx");
    const r = await activateSkill("real-fresh-ctx", { roots: [root] }); // default subprocess runner
    expect(r.activated).toBe(true);
    expect(isActivated(dir)).toBe(true);
  }, 60_000);
});
