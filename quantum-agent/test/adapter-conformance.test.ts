// Fake-SDK conformance tests: prove each adapter actually wires the SDK with the
// exact arguments claimed (constructor/thread/runner args, provider dispatch,
// key/baseUrl mapping, resume vs start, workdir, sandbox/approval, usage) and
// that an unavailable runtime throws with zero fallback. No real SDKs are
// installed; a fake importer injects capturing modules.

import { describe, expect, it } from "vitest";
import type { Importer } from "../src/runtimes/adapter.ts";
import {
  makeClaudeAdapter,
  makeCodexAdapter,
  makeOpenAIAgentsAdapter,
} from "../src/runtimes/index.ts";

function fakeImporter(map: Record<string, unknown>): Importer {
  return async (spec: string) => (spec in map ? map[spec] : null);
}

const RUN = { prompt: "do a thing", model: "test-model", sessionId: "s-1" };

// ---------------------------------------------------------------- Claude
describe("claude adapter wiring", () => {
  it("wires model/session/resume/mcp/permissions/streaming and maps usage", async () => {
    let captured: Record<string, unknown> | undefined;
    const sdk = {
      query: (args: { prompt: string; options: Record<string, unknown> }) => {
        captured = args.options;
        return (async function* () {
          yield { type: "assistant", message: { content: [{ type: "text", text: "pong" }] } };
          yield {
            type: "result",
            total_cost_usd: 0.001,
            usage: { input_tokens: 3, output_tokens: 1 },
          };
        })();
      },
    };
    const adapter = makeClaudeAdapter(fakeImporter({ "@anthropic-ai/claude-agent-sdk": sdk }));
    const r = await adapter.run({ ...RUN, resume: "prev-session" }, {
      ANTHROPIC_API_KEY: "sk-ant-x",
    } as NodeJS.ProcessEnv);
    expect(r.mock).toBe(false);
    expect(r.provider).toBe("anthropic");
    expect(r.text).toBe("pong");
    expect(r.usage).toEqual({ inputTokens: 3, outputTokens: 1, costUsd: 0.001 });
    expect(captured?.model).toBe("test-model");
    expect(captured?.sessionId).toBe("s-1");
    expect(captured?.resume).toBe("prev-session");
    expect(captured?.permissionMode).toBe("bypassPermissions");
    expect(captured?.includePartialMessages).toBe(true);
    expect(captured?.mcpServers).toBeDefined();
    expect(captured?.canUseTool).toBeTypeOf("function");
  });

  it("live probe requires an EXACT pong (non-pong => live but ok=false)", async () => {
    const mk = (reply: string) =>
      makeClaudeAdapter(
        fakeImporter({
          "@anthropic-ai/claude-agent-sdk": {
            query: () =>
              (async function* () {
                yield { type: "assistant", message: { content: [{ type: "text", text: reply }] } };
              })(),
          },
        }),
      );
    const good = await mk("pong").liveProbe({ ANTHROPIC_API_KEY: "x" } as NodeJS.ProcessEnv);
    expect(good.status).toBe("live");
    expect(good.ok).toBe(true);
    const bad = await mk("hello there").liveProbe({ ANTHROPIC_API_KEY: "x" } as NodeJS.ProcessEnv);
    expect(bad.status).toBe("live");
    expect(bad.ok).toBe(false);
    const none = await mk("pong").liveProbe({} as NodeJS.ProcessEnv);
    expect(none.status).toBe("not_verified");
  });
});

// ------------------------------------------------------- OpenAI Agents
function openaiFakes() {
  const cap: {
    clientOpts?: { apiKey?: string; baseURL?: string };
    modelBoundClientOpts?: { apiKey?: string; baseURL?: string };
    modelName?: string;
    agentModel?: unknown;
    ran?: { agent: object; input: string };
    aisdkArg?: unknown;
    providerFactoryArg?: string;
    setKeyCalled: boolean;
    setClientCalled: boolean;
  } = { setKeyCalled: false, setClientCalled: false };
  class FakeClient {
    constructor(public opts: { apiKey?: string; baseURL?: string }) {
      cap.clientOpts = opts;
    }
  }
  const agents = {
    Agent: class {
      constructor(public cfg: { name: string; model: unknown; instructions?: string }) {
        cap.agentModel = cfg.model;
      }
    },
    run: async (agent: object, input: string) => {
      cap.ran = { agent, input };
      return { finalOutput: "pong", usage: { inputTokens: 5, outputTokens: 2 } };
    },
    // Per-run, client-bound model class (the isolated path). We record the client
    // opts bound into THIS model so tests can assert per-run isolation.
    OpenAIResponsesModel: class {
      constructor(
        public client: { opts?: { apiKey?: string; baseURL?: string } },
        public model: string,
      ) {
        cap.modelBoundClientOpts = client.opts;
        cap.modelName = model;
      }
    },
    // Process-global setters — MUST NOT be called (isolation). We record calls.
    setDefaultOpenAIKey: (_k: string) => {
      cap.setKeyCalled = true;
    },
    setDefaultOpenAIClient: (_c: unknown) => {
      cap.setClientCalled = true;
    },
  };
  const openai = { default: FakeClient };
  const ext = {
    aisdk: (m: unknown) => {
      cap.aisdkArg = m;
      return { wrapped: m };
    },
  };
  const provider = {
    default: (model: string) => {
      cap.providerFactoryArg = model;
      return { providerModel: model };
    },
  };
  return { cap, agents, openai, ext, provider };
}

describe("openai-agents adapter wiring", () => {
  it("direct OpenAI: binds a per-run client to the model; never mutates globals", async () => {
    const { cap, agents, openai } = openaiFakes();
    const a = makeOpenAIAgentsAdapter(fakeImporter({ "@openai/agents": agents, openai }));
    const r = await a.run(RUN, { OPENAI_API_KEY: "sk-openai-1" } as NodeJS.ProcessEnv);
    expect(cap.modelBoundClientOpts).toEqual({ apiKey: "sk-openai-1", baseURL: undefined });
    expect(cap.modelName).toBe("test-model");
    expect(cap.setKeyCalled).toBe(false); // no process-global mutation
    expect(cap.setClientCalled).toBe(false);
    expect(cap.ran?.input).toBe("do a thing");
    expect(r.provider).toBe("openai");
    expect(r.usage).toEqual({ inputTokens: 5, outputTokens: 2, costUsd: undefined });
  });

  it("base URL: constructs the per-run client with {apiKey,baseURL}, no globals", async () => {
    const { cap, agents, openai } = openaiFakes();
    const a = makeOpenAIAgentsAdapter(fakeImporter({ "@openai/agents": agents, openai }));
    const r = await a.run(RUN, {
      OPENAI_API_KEY: "sk-openai-2",
      QUANTUM_BASE_URL: "https://proxy.example/v1",
    } as NodeJS.ProcessEnv);
    expect(cap.modelBoundClientOpts).toEqual({
      apiKey: "sk-openai-2",
      baseURL: "https://proxy.example/v1",
    });
    expect(cap.setClientCalled).toBe(false);
    expect(cap.setKeyCalled).toBe(false);
    expect(r.provider).toBe("openai-compatible");
  });

  it("ai-sdk provider: imports the extension + provider pkg and dispatches via aisdk(providerModel)", async () => {
    const { cap, agents, ext, provider } = openaiFakes();
    const a = makeOpenAIAgentsAdapter(
      fakeImporter({
        "@openai/agents": agents,
        "@openai/agents-extensions": ext,
        "@ai-sdk/google": provider,
      }),
    );
    const r = await a.run(RUN, {
      OPENAI_API_KEY: "sk-x",
      QUANTUM_PROVIDER: "google",
      QUANTUM_AISDK_PACKAGE: "@ai-sdk/google",
    } as NodeJS.ProcessEnv);
    expect(cap.providerFactoryArg).toBe("test-model");
    expect(cap.aisdkArg).toEqual({ providerModel: "test-model" });
    expect(cap.agentModel).toEqual({ wrapped: { providerModel: "test-model" } });
    expect(r.provider).toBe("vercel-ai-sdk:google");
  });

  it("unavailable (no key) throws with zero fallback", async () => {
    const { agents } = openaiFakes();
    const a = makeOpenAIAgentsAdapter(fakeImporter({ "@openai/agents": agents }));
    await expect(a.run(RUN, {} as NodeJS.ProcessEnv)).rejects.toThrow(/openai-agents.*unavailable/);
  });
});

// ---------------------------------------------------------------- Codex
function codexFakes() {
  const cap: {
    ctor?: { apiKey?: string; baseUrl?: string; env?: Record<string, string> };
    startOpts?: Record<string, unknown>;
    resumeId?: string;
    ranPrompt?: string;
  } = {};
  const thread = {
    run: async (input: string) => {
      cap.ranPrompt = input;
      return { finalResponse: "pong", usage: { inputTokens: 7, outputTokens: 1 } };
    },
  };
  const Codex = class {
    constructor(public opts: { apiKey?: string; baseUrl?: string; env?: Record<string, string> }) {
      cap.ctor = opts;
    }
    startThread(opts: Record<string, unknown>) {
      cap.startOpts = opts;
      return thread;
    }
    resumeThread(id: string) {
      cap.resumeId = id;
      return thread;
    }
  };
  return { cap, sdk: { Codex } };
}

describe("codex adapter wiring", () => {
  it("start: wires key/baseUrl/env + model + sandbox=danger-full-access + approval=never", async () => {
    const { cap, sdk } = codexFakes();
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    const r = await a.run(RUN, {
      CODEX_API_KEY: "codex-key-1",
      QUANTUM_BASE_URL: "https://cx.example/v1",
      QUANTUM_WORKDIR: "/work/here",
      PATH: "/usr/bin",
    } as NodeJS.ProcessEnv);
    expect(cap.ctor?.apiKey).toBe("codex-key-1");
    expect(cap.ctor?.baseUrl).toBe("https://cx.example/v1");
    expect(cap.ctor?.env?.CODEX_API_KEY).toBe("codex-key-1");
    expect(cap.ctor?.env?.OPENAI_BASE_URL).toBe("https://cx.example/v1");
    expect(cap.startOpts?.model).toBe("test-model");
    expect(cap.startOpts?.workingDirectory).toBe("/work/here");
    expect(cap.startOpts?.sandboxMode).toBe("danger-full-access");
    expect(cap.startOpts?.approvalPolicy).toBe("never");
    expect(cap.resumeId).toBeUndefined();
    expect(cap.ranPrompt).toBe("do a thing");
    expect(r.usage).toEqual({ inputTokens: 7, outputTokens: 1, costUsd: undefined });
  });

  it("resume: calls resumeThread(id), not startThread", async () => {
    const { cap, sdk } = codexFakes();
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    await a.run({ ...RUN, resume: "thread-42" }, { OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv);
    expect(cap.resumeId).toBe("thread-42");
    expect(cap.startOpts).toBeUndefined();
  });

  it("unavailable (no key) throws with zero fallback", async () => {
    const { sdk } = codexFakes();
    const a = makeCodexAdapter(fakeImporter({ "@openai/codex-sdk": sdk }));
    await expect(a.run(RUN, {} as NodeJS.ProcessEnv)).rejects.toThrow(/codex.*unavailable/);
  });
});
