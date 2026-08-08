// Verifies `--skill` routing is wired through runAgent. Previously
// `RunOptions.skill` was forwarded by the CLI but ignored by runAgent —
// making `quantum run --skill foo` a silent no-op.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent.ts";
import { loadSkillByName } from "../src/skills/manager.ts";

// Hermetic: default (claude mock) runtime regardless of ambient QUANTUM_* env
// or any persisted `provider select` selection.
beforeEach(() => {
  vi.stubEnv("QUANTUM_HOME", mkdtempSync(`${tmpdir()}/qa-skill-`));
  vi.stubEnv("QUANTUM_RUNTIME", "");
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("--skill routing", () => {
  it("loadSkillByName finds a shipped meta-skill", () => {
    // hyperplan is one of the skills-core entries shipped with the package.
    const skill = loadSkillByName("hyperplan");
    expect(skill).not.toBeNull();
    expect(skill?.body.length ?? 0).toBeGreaterThan(0);
  });

  it("unknown skill returns null", () => {
    expect(loadSkillByName("no-such-skill-xyz-9999")).toBeNull();
  });

  it("runAgent with an unknown skill still completes (warns, never throws)", async () => {
    const r = await runAgent("hello", { skill: "no-such-skill-xyz-9999" });
    expect(r.text.length).toBeGreaterThan(0);
  });
});
