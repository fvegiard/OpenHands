// Typed provider-profile tests: prove profiles switch provider/API-key WITHOUT
// storing secret values, that a MiniMax (Vercel AI SDK) profile wires the exact
// factory/model/key/baseURL with secret isolation and no fallback, that Codex
// --resume-thread-id reaches resumeThread(id), and the red cases (invalid secret
// NAME, missing selected key, missing package/export, cross-provider leakage,
// persistence/precedence). No real SDKs are installed; a fake importer injects
// capturing modules.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  persistSelection,
  RuntimeConfigSchema,
  resolveRuntimeConfig,
  validateProvider,
} from "../src/providers/registry.ts";
import type { Importer, RuntimeProfile } from "../src/runtimes/adapter.ts";
import { makeCodexAdapter, makeOpenAIAgentsAdapter } from "../src/runtimes/index.ts";

function fakeImporter(map: Record<string, unknown>): Importer {
  return async (spec: string) => (spec in map ? map[spec] : null);
}

const RUN = { prompt: "do a thing", model: "MiniMax-M3", sessionId: "s-1" };
const MM_PKG = "vercel-minimax-ai-provider";

interface MiniMaxCap {
  agentModel?: unknown;
  key?: string;
  openaiClientOpts?: unknown;
  createOpts?: { apiKey?: string; baseURL?: string };
  instanceArg?: string;
  factoryArg?: string;
  aisdkArg?: unknown;
}

function minimaxFakes(opts: { withCreator: boolean }) {
  const cap: MiniMaxCap = {};
  const agents = {
    Agent: class {
      constructor(public cfg: { name: string; model: unknown; instructions?: string }) {
        cap.agentModel = cfg.model;
      }
    },
    run: async () => ({ finalOutput: "ok", usage: { inputTokens: 1, outputTokens: 1 } }),
    setDefaultOpenAIKey: (k: string) => {
      cap.key = k;
    },
    setDefaultOpenAIClient: (_c: unknown) => {
      cap.openaiClientOpts = _c;
    },
  };
  const ext = {
    aisdk: (m: unknown) => {
      cap.aisdkArg = m;
      return { wrapped: m };
    },
  };
  const instance = (model: string) => {
    cap.instanceArg = model;
    return { pm: model };
  };
  const createMinimax = (o: { apiKey?: string; baseURL?: string }) => {
    cap.createOpts = o;
    return (model: string) => {
      cap.factoryArg = model;
      return { pm: model, cfg: o };
    };
  };
  const provider = opts.withCreator ? { minimax: instance, createMinimax } : { minimax: instance };
  const openai = {
    default: class {
      constructor(public o: { apiKey?: string; baseURL?: string }) {
        cap.openaiClientOpts = o;
      }
    },
  };
  return { cap, agents, ext, provider, openai };
}

const MM_PROFILE: RuntimeProfile = {
  provider: "minimax",
  providerPackage: MM_PKG,
  secretEnv: "MINIMAX_API_KEY",
  baseUrl: "https://mm.example/v1",
};

// ------------------------------------------------------ MiniMax wiring
describe("MiniMax profile (openai-agents + vercel-ai-sdk)", () => {
  it("creator path: wires create<Provider>({apiKey,baseURL}) + factory(model), isolates the OpenAI globals", async () => {
    const { cap, agents, ext, provider } = minimaxFakes({ withCreator: true });
    const a = makeOpenAIAgentsAdapter(
      fakeImporter({
        "@openai/agents": agents,
        "@openai/agents-extensions": ext,
        [MM_PKG]: provider,
      }),
    );
    const r = await a.run(
      RUN,
      { MINIMAX_API_KEY: "mm-key", OPENAI_API_KEY: "must-not-be-used" } as NodeJS.ProcessEnv,
      MM_PROFILE,
    );
    // Exact key/baseURL injected into the MiniMax provider only.
    expect(cap.createOpts).toEqual({ apiKey: "mm-key", baseURL: "https://mm.example/v1" });
    expect(cap.factoryArg).toBe("MiniMax-M3"); // M3 is configurable (live M3 NOT VERIFIED)
    expect(cap.aisdkArg).toEqual({
      pm: "MiniMax-M3",
      cfg: { apiKey: "mm-key", baseURL: "https://mm.example/v1" },
    });
    expect(cap.agentModel).toEqual({ wrapped: cap.aisdkArg });
    expect(r.provider).toBe("vercel-ai-sdk:minimax");
    // Secret isolation: the OpenAI default key/client were never touched.
    expect(cap.key).toBeUndefined();
    expect(cap.openaiClientOpts).toBeUndefined();
  });

  it("instance path (no creator): calls minimax(model); still never sets the OpenAI key (isolation)", async () => {
    const { cap, agents, ext, provider } = minimaxFakes({ withCreator: false });
    const a = makeOpenAIAgentsAdapter(
      fakeImporter({
        "@openai/agents": agents,
        "@openai/agents-extensions": ext,
        [MM_PKG]: provider,
      }),
    );
    const r = await a.run(
      RUN,
      { MINIMAX_API_KEY: "mm-key", OPENAI_API_KEY: "must-not-be-used" } as NodeJS.ProcessEnv,
      MM_PROFILE,
    );
    expect(cap.instanceArg).toBe("MiniMax-M3");
    expect(r.provider).toBe("vercel-ai-sdk:minimax");
    expect(cap.key).toBeUndefined();
    expect(cap.openaiClientOpts).toBeUndefined();
  });
});

// ------------------------------------------------------ red: secrets
describe("provider profile secret handling (no fallback, no leakage)", () => {
  it("missing selected key => unavailable naming the exact env (no fallback to OPENAI_API_KEY)", async () => {
    const { agents } = minimaxFakes({ withCreator: true });
    const a = makeOpenAIAgentsAdapter(fakeImporter({ "@openai/agents": agents }));
    const avail = await a.available({ OPENAI_API_KEY: "present" } as NodeJS.ProcessEnv, MM_PROFILE);
    expect(avail.ok).toBe(false);
    expect(avail.missingSecretNames).toEqual(["MINIMAX_API_KEY"]);
    await expect(
      a.run(RUN, { OPENAI_API_KEY: "present" } as NodeJS.ProcessEnv, MM_PROFILE),
    ).rejects.toThrow(/unavailable.*MINIMAX_API_KEY|MINIMAX_API_KEY/);
  });

  it("invalid secret env NAME is rejected by the schema and reported by the adapter", async () => {
    const parsed = RuntimeConfigSchema.safeParse({
      runtime: "openai-agents",
      secretEnv: "bad name!",
    });
    expect(parsed.success).toBe(false);
    const { agents } = minimaxFakes({ withCreator: true });
    const a = makeOpenAIAgentsAdapter(fakeImporter({ "@openai/agents": agents }));
    const avail = await a.available({ "bad name!": "x" } as NodeJS.ProcessEnv, {
      ...MM_PROFILE,
      secretEnv: "bad name!",
    });
    expect(avail.ok).toBe(false);
    expect(avail.reason).toMatch(/invalid secret env NAME/);
  });

  it("cross-provider leakage: codex uses ONLY the selected NAME in its sanitized env", async () => {
    const cap: { ctor?: { apiKey?: string; baseUrl?: string; env?: Record<string, string> } } = {};
    const thread = { run: async () => ({ finalResponse: "ok" }) };
    const sdk = {
      Codex: class {
        constructor(public o: { apiKey?: string; baseUrl?: string; env?: Record<string, string> }) {
          cap.ctor = o;
        }
        startThread() {
          return thread;
        }
        resumeThread() {
          return thread;
        }
      },
    };
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    await a.run(
      RUN,
      { CODEX_API_KEY: "ck", OPENAI_API_KEY: "other", PATH: "/usr/bin" } as NodeJS.ProcessEnv,
      {
        secretEnv: "CODEX_API_KEY",
        baseUrl: "https://cx.example/v1",
      },
    );
    expect(cap.ctor?.apiKey).toBe("ck");
    expect(cap.ctor?.env?.CODEX_API_KEY).toBe("ck");
    expect(cap.ctor?.env?.OPENAI_API_KEY).toBeUndefined(); // not leaked
    expect(cap.ctor?.env?.OPENAI_BASE_URL).toBe("https://cx.example/v1");
  });
});

// ------------------------------------------------------ red: package/export
describe("provider package resolution (fail-closed)", () => {
  it("provider selected but no provider package => explicit error", async () => {
    const { agents, ext } = minimaxFakes({ withCreator: true });
    const a = makeOpenAIAgentsAdapter(
      fakeImporter({ "@openai/agents": agents, "@openai/agents-extensions": ext }),
    );
    await expect(
      a.run(RUN, { MINIMAX_API_KEY: "mm-key" } as NodeJS.ProcessEnv, {
        provider: "minimax",
        secretEnv: "MINIMAX_API_KEY",
      }),
    ).rejects.toThrow(/no provider package|provider package/i);
  });

  it("provider package present but missing the export => explicit error", async () => {
    const { agents, ext } = minimaxFakes({ withCreator: true });
    const a = makeOpenAIAgentsAdapter(
      fakeImporter({ "@openai/agents": agents, "@openai/agents-extensions": ext, [MM_PKG]: {} }),
    );
    await expect(
      a.run(RUN, { MINIMAX_API_KEY: "mm-key" } as NodeJS.ProcessEnv, MM_PROFILE),
    ).rejects.toThrow(/has no 'minimax' export/);
  });
});

// ------------------------------------------------------ codex resume
describe("codex resume via profile.resumeThreadId", () => {
  function codexFakes() {
    const cap: { startOpts?: Record<string, unknown>; resumeId?: string } = {};
    const thread = { run: async () => ({ finalResponse: "ok" }) };
    const sdk = {
      Codex: class {
        constructor(_o: unknown) {}
        startThread(o: Record<string, unknown>) {
          cap.startOpts = o;
          return thread;
        }
        resumeThread(id: string) {
          cap.resumeId = id;
          return thread;
        }
      },
    };
    return { cap, sdk };
  }

  it("resume-thread-id reaches resumeThread(id) (not startThread)", async () => {
    const { cap, sdk } = codexFakes();
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    await a.run(RUN, { OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv, { resumeThreadId: "th-77" });
    expect(cap.resumeId).toBe("th-77");
    expect(cap.startOpts).toBeUndefined();
  });

  it("an explicit run --resume wins over the profile resumeThreadId", async () => {
    const { cap, sdk } = codexFakes();
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    await a.run({ ...RUN, resume: "explicit" }, { OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv, {
      resumeThreadId: "th-77",
    });
    expect(cap.resumeId).toBe("explicit");
  });
});

// ------------------------------------------------------ persistence/precedence
describe("profile persistence & precedence (no value stored)", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "qa-profile-"));
    process.env.QUANTUM_HOME = home;
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.QUANTUM_HOME;
    delete process.env.QUANTUM_RUNTIME;
    delete process.env.QUANTUM_SECRET_ENV;
    delete process.env.QUANTUM_BASE_URL;
    delete process.env.QUANTUM_PROVIDER_PACKAGE;
  });

  it("persists NAMES/config only — runtime.json never contains a key value", () => {
    const file = persistSelection({
      runtime: "openai-agents",
      provider: "minimax",
      model: "MiniMax-M3",
      baseUrl: "https://mm.example/v1",
      secretEnv: "MINIMAX_API_KEY",
      providerPackage: MM_PKG,
    });
    const raw = readFileSync(file, "utf8");
    const json = JSON.parse(raw);
    expect(json.secretEnv).toBe("MINIMAX_API_KEY");
    expect(json.providerPackage).toBe(MM_PKG);
    // No secret VALUE ever appears (only the NAME).
    expect(raw).not.toMatch(/sk-|api[_-]?key.*:.*["'][A-Za-z0-9]{12,}/i);
    expect(Object.keys(json).sort()).toEqual(
      ["baseUrl", "model", "provider", "providerPackage", "runtime", "secretEnv"].sort(),
    );
  });

  it("reads a persisted profile, and env overrides it (precedence)", () => {
    persistSelection({
      runtime: "openai-agents",
      provider: "minimax",
      model: "MiniMax-M3",
      secretEnv: "MINIMAX_API_KEY",
      providerPackage: MM_PKG,
    });
    const persisted = resolveRuntimeConfig({ QUANTUM_HOME: home } as NodeJS.ProcessEnv);
    expect(persisted.secretEnv).toBe("MINIMAX_API_KEY");
    expect(persisted.providerPackage).toBe(MM_PKG);

    const overridden = resolveRuntimeConfig({
      QUANTUM_HOME: home,
      QUANTUM_SECRET_ENV: "OTHER_KEY",
      QUANTUM_BASE_URL: "https://override.example/v1",
    } as NodeJS.ProcessEnv);
    expect(overridden.secretEnv).toBe("OTHER_KEY");
    expect(overridden.baseUrl).toBe("https://override.example/v1");
  });
});

// ------------------------------------------------------ validateProvider
describe("validateProvider open-ended for openai-agents", () => {
  it("minimax needs a provider package; claude rejects it", () => {
    expect(validateProvider("openai-agents", "minimax")).toMatch(
      /provider package|AI SDK package/i,
    );
    expect(validateProvider("openai-agents", "minimax", MM_PKG)).toBeNull();
    expect(validateProvider("openai-agents", "openai")).toBeNull();
    expect(validateProvider("claude", "minimax")).toMatch(/not supported/);
  });
});
