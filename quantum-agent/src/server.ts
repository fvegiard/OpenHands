// `quantum serve` — local Hono HTTP server with SSE streaming.
// `--mcp` flag turns it into an MCP HTTP/SSE server that Claude clients
// (desktop, mobile via GitHub MCP) can connect to.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { runAgent } from "./agent.ts";
import { listAgents } from "./agents/registry.ts";
import { recall, remember } from "./memory.ts";
import { listInstalled } from "./skills/manager.ts";

export interface ServeOptions {
  port: number;
  mcp: boolean;
  bearer?: string;
}

export function buildApp(opts: ServeOptions): Hono {
  const app = new Hono();
  const requireAuth = async (c: any, next: any) => {
    const token = opts.bearer ?? process.env.QUANTUM_BEARER_TOKEN;
    if (!token) return next();
    const got = c.req.header("authorization") ?? "";
    if (got !== `Bearer ${token}`) return c.text("unauthorized", 401);
    await next();
  };

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/v1/agents", requireAuth, (c) => c.json({ agents: listAgents() }));
  app.get("/v1/skills", requireAuth, (c) =>
    c.json({ skills: listInstalled().map((s) => s.frontmatter) }),
  );

  app.post("/v1/chat", requireAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? "");
    const result = await runAgent(prompt, { resume: body.resume, quantum: !!body.quantum });
    return c.json(result);
  });

  if (opts.mcp) {
    app.get("/mcp/v1/tools", requireAuth, (c) =>
      c.json({
        tools: [
          { name: "quantum.run", description: "One-shot prompt" },
          { name: "quantum.run_quantum", description: "Full superpose→measure loop" },
          { name: "quantum.recall", description: "Search the entangled blackboard" },
          { name: "quantum.remember", description: "Persist a fact" },
          { name: "quantum.list_agents", description: "List specialist agents" },
          { name: "quantum.list_skills", description: "List installed skills" },
        ],
      }),
    );
    app.post("/mcp/v1/call/:tool", requireAuth, async (c) => {
      const tool = c.req.param("tool");
      const body = await c.req.json().catch(() => ({}));
      switch (tool) {
        case "quantum.run":
          return c.json(await runAgent(String(body.prompt ?? ""), {}));
        case "quantum.run_quantum":
          return c.json(await runAgent(String(body.prompt ?? ""), { quantum: true }));
        case "quantum.list_agents":
          return c.json({ agents: listAgents() });
        case "quantum.list_skills":
          return c.json({ skills: listInstalled().map((s) => s.frontmatter) });
        case "quantum.recall": {
          const query = String(body.query ?? "");
          const ns = body.ns ? String(body.ns) : undefined;
          const limit = Number.isFinite(body.limit) ? Number(body.limit) : undefined;
          return c.json({ facts: recall(query, ns, limit) });
        }
        case "quantum.remember": {
          const key = String(body.key ?? "");
          const value = String(body.value ?? "");
          if (!key || !value) return c.json({ error: "key and value required" }, 400);
          const ns = body.ns ? String(body.ns) : undefined;
          const tags = Array.isArray(body.tags) ? body.tags.map(String) : undefined;
          const id = remember(key, value, ns, tags);
          return c.json({ id });
        }
        default:
          return c.text(`unknown tool: ${tool}`, 404);
      }
    });
  }
  return app;
}

export async function start(opts: ServeOptions): Promise<{ stop: () => Promise<void> }> {
  const app = buildApp(opts);
  const server = serve({ fetch: app.fetch, port: opts.port, hostname: "127.0.0.1" });
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
