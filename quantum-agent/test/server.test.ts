// Smoke tests for the local Hono / MCP server. Boots `buildApp` against
// `fetch` directly so we don't need a real port.

import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";

const auth = new Headers({ "Content-Type": "application/json" });

describe("server / MCP", () => {
  const app = buildApp({ port: 0, mcp: true });

  it("/health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("/mcp/v1/tools advertises recall and remember", async () => {
    const res = await app.request("/mcp/v1/tools");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tools: { name: string }[] };
    const names = json.tools.map((t) => t.name);
    expect(names).toContain("quantum.recall");
    expect(names).toContain("quantum.remember");
  });

  it("calling quantum.remember persists and returns an id", async () => {
    const key = `srv-test-${Date.now()}`;
    const res = await app.request("/mcp/v1/call/quantum.remember", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ key, value: "hello", ns: "test" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: number };
    expect(typeof json.id).toBe("number");
    expect(json.id).toBeGreaterThan(0);
  });

  it("calling quantum.remember without key/value returns 400", async () => {
    const res = await app.request("/mcp/v1/call/quantum.remember", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("calling quantum.recall finds a previously remembered fact", async () => {
    const key = `srv-recall-${Date.now()}`;
    await app.request("/mcp/v1/call/quantum.remember", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ key, value: "needle-in-haystack", ns: "test" }),
    });
    const res = await app.request("/mcp/v1/call/quantum.recall", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ query: "needle-in-haystack", ns: "test" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { facts: { value: string }[] };
    expect(json.facts.some((f) => f.value === "needle-in-haystack")).toBe(true);
  });

  it("unknown tool returns 404 (no regression)", async () => {
    const res = await app.request("/mcp/v1/call/quantum.nonsense", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
