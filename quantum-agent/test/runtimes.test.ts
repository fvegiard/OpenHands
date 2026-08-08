import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent.ts";
import { providerTest } from "../src/providers/registry.ts";
import { getAdapter } from "../src/runtimes/index.ts";

// Isolate persisted selection + credentials so tests are hermetic.
beforeEach(() => {
  vi.stubEnv("QUANTUM_HOME", mkdtempSync(`${tmpdir()}/qa-rt-`));
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("CODEX_API_KEY", "");
  vi.stubEnv("QUANTUM_RUNTIME", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("runtime adapters are distinct", () => {
  it("maps each runtime id to a distinct adapter", () => {
    const c = getAdapter("claude");
    const o = getAdapter("openai-agents");
    const x = getAdapter("codex");
    expect(c.id).toBe("claude");
    expect(o.id).toBe("openai-agents");
    expect(x.id).toBe("codex");
    expect(o).not.toBe(x);
    expect(c).not.toBe(o);
  });

  it("reports openai-agents and codex as discoverable with exact package + secret", async () => {
    const o = await getAdapter("openai-agents").available(process.env);
    expect(o.ok).toBe(false);
    expect(o.missingPackages).toContain("@openai/agents");
    expect(o.missingSecretNames).toContain("OPENAI_API_KEY");

    const x = await getAdapter("codex").available(process.env);
    expect(x.ok).toBe(false);
    expect(x.missingPackages).toContain("@openai/codex-sdk");
  });
});

describe("runAgent dispatch changes with the selected runtime (no fallback)", () => {
  it("default claude runtime with no secret uses the claude mock transport", async () => {
    const r = await runAgent("hello");
    expect(r.mock).toBe(true);
    expect(r.text).toContain("[mock]");
  });

  it("selecting openai-agents (unavailable) throws — never falls back to claude/mock", async () => {
    vi.stubEnv("QUANTUM_RUNTIME", "openai-agents");
    await expect(runAgent("hello")).rejects.toThrow(
      /openai-agents.*unavailable|unavailable.*openai-agents/,
    );
  });

  it("selecting codex (unavailable) throws a distinct error — no fallback", async () => {
    vi.stubEnv("QUANTUM_RUNTIME", "codex");
    await expect(runAgent("hello")).rejects.toThrow(/codex.*unavailable|unavailable.*codex/);
  });

  it("an invalid runtime id is rejected before any run (no silent fallback)", async () => {
    vi.stubEnv("QUANTUM_RUNTIME", "gemini-bogus");
    await expect(runAgent("hello")).rejects.toThrow(/invalid QUANTUM_RUNTIME/);
  });
});

describe("providerTest is contract-only (no unsupported live claim)", () => {
  it("never returns kind='live' without a real call", async () => {
    const r = await providerTest({ runtime: "claude", model: "claude-opus-4-7" }, process.env);
    expect(r.kind).toBe("contract");
  });

  it("live probe on an unavailable runtime returns NOT VERIFIED (not executed)", async () => {
    const probe = await getAdapter("openai-agents").liveProbe(process.env);
    expect(probe.status).toBe("not_verified");
    expect(probe.ok).toBe(false);
    expect(probe.message).toMatch(/not executed/);
  });

  it("claude live probe with no secret is NOT VERIFIED (no call made)", async () => {
    const probe = await getAdapter("claude").liveProbe(process.env);
    expect(probe.status).toBe("not_verified");
    expect(probe.ok).toBe(false);
  });
});
