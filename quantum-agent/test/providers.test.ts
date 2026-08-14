import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  persistSelection,
  providerTest,
  REGISTRY,
  RuntimeId,
  resolveRuntimeConfig,
  runtimeStatus,
  validateProvider,
} from "../src/providers/registry.ts";

// Isolate persisted state per test via QUANTUM_HOME.
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "qa-prov-"));
  process.env.QUANTUM_HOME = home;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.QUANTUM_HOME;
  delete process.env.QUANTUM_RUNTIME;
  delete process.env.QUANTUM_PROVIDER;
  delete process.env.QUANTUM_MODEL;
});

describe("provider registry", () => {
  it("has an exhaustive spec for every runtime id", () => {
    for (const id of RuntimeId.options) {
      const spec = REGISTRY[id];
      expect(spec.id).toBe(id);
      expect(spec.npmPackages.length).toBeGreaterThan(0);
      expect(spec.secretEnv.length).toBeGreaterThan(0);
      for (const c of CAPABILITIES) expect(typeof spec.capabilities[c]).toBe("boolean");
    }
  });

  it("keeps the claude runtime bundled and claude-coupled", async () => {
    const st = await runtimeStatus("claude", "claude", {});
    expect(st.installed).toBe(true); // @anthropic-ai/claude-agent-sdk is a dependency
    expect(REGISTRY.claude.claudeCoupled).toBe(true);
  });

  it("reports optional runtimes as discoverable with exact package + secret", async () => {
    const st = await runtimeStatus("openai-agents", "claude", {});
    expect(st.installed).toBe(false);
    expect(st.missingPackages).toContain("@openai/agents");
    expect(st.missingSecretNames).toContain("OPENAI_API_KEY");
    expect(st.diagnostic).toContain("pnpm add");
  });

  it("resolves env config with precedence and Zod parsing", () => {
    process.env.QUANTUM_RUNTIME = "codex";
    process.env.QUANTUM_MODEL = "gpt-5.1-codex";
    const cfg = resolveRuntimeConfig(process.env);
    expect(cfg.runtime).toBe("codex");
    expect(cfg.model).toBe("gpt-5.1-codex");
  });

  it("throws a precise error on an invalid runtime (no silent fallback)", () => {
    expect(() =>
      resolveRuntimeConfig({ QUANTUM_RUNTIME: "gemini-native" } as NodeJS.ProcessEnv),
    ).toThrow(/invalid QUANTUM_RUNTIME/);
  });

  it("persists and reads a selection when env vars are absent", () => {
    persistSelection({ runtime: "codex", model: "gpt-5.1-codex" });
    const cfg = resolveRuntimeConfig({ QUANTUM_HOME: home } as NodeJS.ProcessEnv);
    expect(cfg.runtime).toBe("codex");
  });

  it("ignores persisted model/profile when QUANTUM_RUNTIME overrides the runtime", () => {
    persistSelection({
      runtime: "codex",
      provider: "openai",
      model: "gpt-5.1-codex",
      secretEnv: "OPENAI_API_KEY",
      resumeThreadId: "thread-stale",
    });
    const cfg = resolveRuntimeConfig({
      QUANTUM_HOME: home,
      QUANTUM_RUNTIME: "claude",
    } as NodeJS.ProcessEnv);
    expect(cfg.runtime).toBe("claude");
    expect(cfg.model).toBe(REGISTRY.claude.defaultModel);
    expect(cfg.provider).toBeUndefined();
    expect(cfg.secretEnv).toBeUndefined();
    expect(cfg.resumeThreadId).toBeUndefined();
  });

  it("keeps persisted profile when env runtime matches persisted runtime", () => {
    persistSelection({ runtime: "codex", model: "gpt-5.1-codex" });
    const cfg = resolveRuntimeConfig({
      QUANTUM_HOME: home,
      QUANTUM_RUNTIME: "codex",
    } as NodeJS.ProcessEnv);
    expect(cfg.runtime).toBe("codex");
    expect(cfg.model).toBe("gpt-5.1-codex");
  });

  it("rejects a provider unsupported by the runtime", () => {
    expect(validateProvider("claude", "openrouter")).toMatch(/not supported/);
    expect(validateProvider("claude", "bedrock")).toBeNull();
  });

  it("provider test contract-passes when installed but reports the missing secret", async () => {
    const r = await providerTest({ runtime: "claude", model: "claude-opus-4-7" }, {});
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("contract");
    expect(r.message).toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("provider test fails for an uninstalled runtime with an install hint", async () => {
    const r = await providerTest({ runtime: "openai-agents", model: "gpt-5.1" }, {});
    expect(r.ok).toBe(false);
    expect(r.message).toContain("pnpm add");
  });
});
