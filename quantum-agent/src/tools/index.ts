// Aggregates all custom tools into a single in-process MCP server.
// We import @anthropic-ai/claude-agent-sdk lazily so the rest of the
// codebase (and tests) work even when the SDK is not installed.

import { z } from "zod";
import { recall, remember } from "../memory.ts";
import { researchTopicSchema, runResearchTopic } from "../research/scout.ts";
import { runValidateStack, validateStackSchema } from "../research/stack-validator.ts";
import { grepSchema, readSchema, runGrep, runRead } from "./repo.ts";
import { runShell, shellSchema } from "./shell.ts";
import { runFetch, webSchema } from "./web.ts";

export interface QuantumToolset {
  serverInstance: unknown;
  toolNames: string[];
}

interface SdkLike {
  tool: (name: string, desc: string, schema: any, handler: any, extras?: any) => unknown;
  createSdkMcpServer: (opts: { name: string; version: string; tools: unknown[] }) => any;
}

async function loadSdk(): Promise<SdkLike | null> {
  try {
    const mod = (await import("@anthropic-ai/claude-agent-sdk")) as Partial<SdkLike>;
    if (mod.tool && mod.createSdkMcpServer) {
      return mod as SdkLike;
    }
    return null;
  } catch {
    return null;
  }
}

export async function buildQuantumToolset(): Promise<QuantumToolset> {
  const sdk = await loadSdk();
  const toolNames = [
    "bash",
    "fetch",
    "grep",
    "read",
    "remember",
    "recall",
    "research_topic",
    "validate_stack",
  ];

  if (!sdk) {
    return { serverInstance: null, toolNames };
  }

  const tools = [
    sdk.tool("bash", "Run a shell command in the project cwd.", shellSchema, async (a: any) =>
      runShell(a.cmd, a.timeoutMs),
    ),
    sdk.tool("fetch", "HTTP GET/POST a URL.", webSchema, async (a: any) => runFetch(a)),
    sdk.tool("grep", "Recursive regex grep within the project.", grepSchema, async (a: any) =>
      runGrep(a),
    ),
    sdk.tool("read", "Read a file (truncated to 64k).", readSchema, async (a: any) => runRead(a)),
    sdk.tool(
      "remember",
      "Persist a fact to the entangled blackboard.",
      { key: z.string(), value: z.string(), ns: z.string().optional() },
      async (a: any) => {
        const id = remember(a.key, a.value, a.ns);
        return { content: [{ type: "text", text: `remembered #${id}` }] };
      },
    ),
    sdk.tool(
      "recall",
      "Search the entangled blackboard for relevant facts.",
      {
        query: z.string(),
        ns: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
      async (a: any) => {
        const facts = recall(a.query, a.ns, a.limit);
        return {
          content: [
            {
              type: "text",
              text: facts.map((f) => `- [${f.key}] ${f.value}`).join("\n") || "(no facts)",
            },
          ],
        };
      },
    ),
    sdk.tool(
      "research_topic",
      "Spawn parallel web-research scouts on different angles (official docs, GitHub issues, blogs) and return a ranked brief.",
      researchTopicSchema,
      async (a: any) => {
        const brief = await runResearchTopic(a);
        const lines = [
          `# Research brief: ${brief.query}`,
          `Scouts: ${brief.uniqueHits}/${brief.totalHits} unique hits`,
          "",
          ...brief.ranked
            .slice(0, 10)
            .map(
              (r, i) =>
                `${i + 1}. [${r.angle}] ${r.title}\n   ${r.url}\n   ${r.snippet.slice(0, 140)}`,
            ),
          "",
          `## Summary\n${brief.summary}`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    ),
    sdk.tool(
      "validate_stack",
      "Inspect the codebase to detect Node/Python versions, package managers, shell config, and path conventions. Optionally cross-reference web research.",
      validateStackSchema,
      async (a: any) => {
        const result = await runValidateStack(a);
        return { content: [{ type: "text", text: result.summary }] };
      },
    ),
  ];

  const server = sdk.createSdkMcpServer({ name: "quantum", version: "0.1.0", tools });
  return { serverInstance: server, toolNames };
}
