import { describe, expect, it } from "vitest";
import { resolveAuth } from "../src/auth.ts";

describe("resolveAuth", () => {
  it("uses CLAUDE_CODE_OAUTH_TOKEN when present", () => {
    const r = resolveAuth({ CLAUDE_CODE_OAUTH_TOKEN: "tok-123" } as any);
    expect(r.mode).toBe("oauth");
    expect(r.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("tok-123");
  });

  it("falls back to ANTHROPIC_API_KEY", () => {
    const r = resolveAuth({ ANTHROPIC_API_KEY: "sk-test" } as any);
    expect(r.mode).toBe("api");
  });

  it("falls back to mock when no auth is available", () => {
    const r = resolveAuth({} as any);
    expect(r.mode).toBe("mock");
    expect(r.env.QUANTUM_MOCK).toBe("1");
  });
});
