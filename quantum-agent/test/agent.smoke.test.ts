import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent.ts";

describe("runAgent smoke (mock)", () => {
  beforeEach(() => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs a one-shot prompt against the mock transport", async () => {
    const r = await runAgent("hello world");
    expect(r.mock).toBe(true);
    expect(r.text).toContain("[mock]");
    expect(r.sessionId).toMatch(/^q-/);
  });

  it("runs the quantum loop end to end", async () => {
    const r = await runAgent("plan a refactor of the auth module", { quantum: true });
    expect(r.text).toMatch(/Quantum result/);
  });
});
