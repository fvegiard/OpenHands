// Conformance against the ACTUAL installed vercel-minimax-ai-provider package
// (a real dependency, not a self-mirroring fake). Proves the real export/factory/
// options shape the openai-agents adapter relies on, and drives the adapter with
// the REAL package end-to-end. No network/live call is made — MiniMax-M3 is
// treated as a configurable model id; a live M3 call remains NOT VERIFIED.

import {
  createMinimax,
  createMinimaxOpenAI,
  minimax,
  minimaxOpenAI,
} from "vercel-minimax-ai-provider";
import { describe, expect, it } from "vitest";
import type { Importer } from "../src/runtimes/adapter.ts";
import { makeOpenAIAgentsAdapter } from "../src/runtimes/index.ts";

function fakeImporter(map: Record<string, unknown>): Importer {
  return async (spec: string) => (spec in map ? map[spec] : null);
}

describe("vercel-minimax-ai-provider real-package conformance", () => {
  it("exports the documented instances and creators", () => {
    expect(typeof minimax).toBe("function");
    expect(typeof minimaxOpenAI).toBe("function");
    expect(typeof createMinimax).toBe("function");
    expect(typeof createMinimaxOpenAI).toBe("function");
  });

  it("instance and creator build a model with the requested id (M3 configurable; live NOT VERIFIED)", () => {
    const m1 = minimax("MiniMax-M3") as { modelId?: string };
    expect(m1.modelId).toBe("MiniMax-M3");
    // Real creator options are { apiKey?, baseURL?, headers? } — no key value used.
    const provider = createMinimax({
      apiKey: "sk-test-not-used",
      baseURL: "https://mm.example/v1",
    });
    expect(typeof provider).toBe("function");
    const m2 = provider("MiniMax-M3") as { modelId?: string };
    expect(m2.modelId).toBe("MiniMax-M3");
  });

  it("the openai-agents adapter drives the REAL package end-to-end (createMinimax + model)", async () => {
    const realMinimax = await import("vercel-minimax-ai-provider");
    let wrapped: { modelId?: string } | undefined;
    const agents = {
      Agent: class {
        constructor(public cfg: unknown) {}
      },
      run: async () => ({ finalOutput: "ok" }),
    };
    const ext = {
      aisdk: (m: unknown) => {
        wrapped = m as { modelId?: string };
        return m;
      },
    };
    const adapter = makeOpenAIAgentsAdapter(
      fakeImporter({
        "@openai/agents": agents,
        "@openai/agents-extensions": ext,
        "vercel-minimax-ai-provider": realMinimax,
      }),
    );
    const r = await adapter.run(
      { prompt: "hi", model: "MiniMax-M3", sessionId: "s" },
      { MINIMAX_API_KEY: "sk-test-not-used" } as NodeJS.ProcessEnv,
      {
        provider: "minimax",
        providerPackage: "vercel-minimax-ai-provider",
        secretEnv: "MINIMAX_API_KEY",
        baseUrl: "https://mm.example/v1",
      },
    );
    expect(r.provider).toBe("vercel-ai-sdk:minimax");
    // The adapter fed a REAL minimax model (modelId MiniMax-M3) into aisdk().
    expect(wrapped?.modelId).toBe("MiniMax-M3");
  });
});
