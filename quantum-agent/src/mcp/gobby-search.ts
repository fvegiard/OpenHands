// Gobby-style codebase search/indexing MCP server.
// Exposes: index_repo, search_code, find_references, cdp_discover.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { z } from "zod";

import { resolveInsideRoot } from "../tools/repo.ts";
import type { ToolResult } from "../tools/shell.ts";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  "vendor",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".lua",
  ".ex",
  ".exs",
  ".erl",
  ".hs",
  ".ml",
  ".zig",
  ".dart",
  ".vue",
  ".svelte",
  ".sol",
  ".proto",
  ".toml",
  ".yaml",
  ".yml",
  ".json",
  ".md",
  ".txt",
]);

interface FileEntry {
  path: string;
  symbols: string[];
  strings: string[];
  lines: string[];
}

interface IndexStore {
  root: string;
  files: Map<string, FileEntry>;
  indexedAt: string;
}

class IndexStore {
  root: string;
  files: Map<string, FileEntry>;
  indexedAt: string;

  constructor() {
    this.root = process.cwd();
    this.files = new Map();
    this.indexedAt = "";
  }
}

let _index = new IndexStore();
export function getIndex(): IndexStore {
  return _index;
}

function walkDir(dir: string, root: string, depth = 0, maxDepth = 10): FileEntry[] {
  if (depth > maxDepth) return [];
  const entries: FileEntry[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.startsWith(".") && name !== ".env.example") continue;
    const full = resolve(dir, name);
    const rel = relative(root, full);
    if (rel.startsWith("..")) continue;
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        entries.push(...walkDir(full, root, depth + 1, maxDepth));
      } else if (st.isFile()) {
        const ext = name.slice(name.lastIndexOf("."));
        if (!CODE_EXTENSIONS.has(ext)) continue;
        try {
          const lines = readFileSync(full, "utf8").split("\n");
          entries.push({ path: rel, symbols: [], strings: [], lines });
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // skip inaccessible entries
    }
  }
  return entries;
}

function extractSymbols(entry: FileEntry): void {
  const syms = new Set<string>();
  const kw =
    /(?:function|class|interface|type|enum|const|let|var|async|def|struct|impl|pub|fn|func|export)\s+([A-Za-z_$][\w$]*)/g;
  for (const line of entry.lines) {
    for (const m of line.matchAll(kw)) {
      if (m[1]) syms.add(m[1]);
    }
    const strMatches = line.match(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g);
    if (strMatches) {
      for (const s of strMatches) {
        const unquoted = s.slice(1, -1);
        if (unquoted.length >= 2 && unquoted.length <= 120) {
          entry.strings.push(unquoted);
        }
      }
    }
  }
  entry.symbols = [...syms];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((t) => t.length > 1);
}

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const indexSchema = {
  root: z.string().default(".").optional(),
  maxDepth: z.number().int().positive().max(20).default(8).optional(),
};

export async function runIndex(args: { root?: string; maxDepth?: number }): Promise<ToolResult> {
  const rawRoot = args.root ?? ".";
  let target: string;
  try {
    target = resolveInsideRoot(rawRoot, process.cwd());
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
  }
  const raw = walkDir(target, target, 0, args.maxDepth ?? 8);
  const files = new Map<string, FileEntry>();
  for (const entry of raw) {
    extractSymbols(entry);
    files.set(entry.path, entry);
  }
  _index = { root: target, files, indexedAt: new Date().toISOString() };
  const totalSymbols = [...files.values()].reduce((s, f) => s + f.symbols.length, 0);
  const totalStrings = [...files.values()].reduce((s, f) => s + f.strings.length, 0);
  return {
    content: [
      {
        type: "text",
        text: `Indexed ${files.size} files in ${target}\nSymbols: ${totalSymbols}\nStrings: ${totalStrings}\nTimestamp: ${_index.indexedAt}`,
      },
    ],
  };
}

export const searchSchema = {
  query: z.string().min(1),
  symbolOnly: z.boolean().default(false).optional(),
  limit: z.number().int().positive().max(50).default(10).optional(),
};

export async function runSearch(args: {
  query: string;
  symbolOnly?: boolean;
  limit?: number;
}): Promise<ToolResult> {
  const idx = getIndex();
  if (idx.files.size === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "Index is empty. Run index_repo first." }],
    };
  }
  const q = args.query;
  const limit = args.limit ?? 10;
  const results: { file: string; line: number; text: string; score: number }[] = [];
  const seen = new Set<string>();
  const qTokens = tokenize(q);
  for (const [relPath, entry] of idx.files) {
    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i]!;
      const lineLower = line.toLowerCase();
      let score = 0;
      if (args.symbolOnly) {
        for (const sym of entry.symbols) {
          if (sym.toLowerCase() === q.toLowerCase()) {
            score = 100;
            break;
          }
        }
        if (score === 0) continue;
      } else {
        if (lineLower.includes(q.toLowerCase())) {
          score = 90;
        } else {
          let matched = 0;
          for (const t of qTokens) {
            if (lineLower.includes(t)) matched++;
          }
          if (qTokens.length > 0) {
            score = Math.round((matched / qTokens.length) * 70);
          }
        }
        if (score === 0) continue;
      }
      const key = `${relPath}:${i + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ file: relPath, line: i + 1, text: line.trimEnd(), score });
      if (results.length >= limit * 3) break;
    }
    if (results.length >= limit * 3) break;
  }
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);
  if (top.length === 0) {
    return { content: [{ type: "text", text: "(no matches)" }] };
  }
  return {
    content: [
      {
        type: "text",
        text: top
          .map(
            (r) =>
              `${r.file}:${r.line} (score=${r.score})\n  ${r.text.length > 200 ? `${r.text.slice(0, 200)}...` : r.text}`,
          )
          .join("\n\n"),
      },
    ],
  };
}

export const findRefsSchema = {
  symbol: z.string().min(1),
  limit: z.number().int().positive().max(100).default(30).optional(),
};

export async function runFindRefs(args: { symbol: string; limit?: number }): Promise<ToolResult> {
  const idx = getIndex();
  if (idx.files.size === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "Index is empty. Run index_repo first." }],
    };
  }
  const sym = args.symbol;
  const limit = args.limit ?? 30;
  const re = new RegExp(`\\b${escRegex(sym)}\\b`);
  const hits: { file: string; line: number; text: string }[] = [];
  outer:
  for (const [relPath, entry] of idx.files) {
    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i]!;
      if (re.test(line)) {
        hits.push({ file: relPath, line: i + 1, text: line.trimEnd() });
        if (hits.length >= limit) break outer;
      }
    }
  }
  if (hits.length === 0) {
    return { content: [{ type: "text", text: `No references to "${sym}" found.` }] };
  }
  return {
    content: [
      {
        type: "text",
        text: hits
          .map(
            (h) =>
              `${h.file}:${h.line}\n  ${h.text.length > 200 ? `${h.text.slice(0, 200)}...` : h.text}`,
          )
          .join("\n\n"),
      },
    ],
  };
}

export const cdpSchema = {
  portStart: z.number().int().positive().default(9222).optional(),
  portEnd: z.number().int().positive().default(9299).optional(),
  wsTimeoutMs: z.number().int().positive().default(4000).optional(),
};

export async function runCdpDiscover(args: {
  portStart?: number;
  portEnd?: number;
  wsTimeoutMs?: number;
}): Promise<ToolResult> {
  const start = args.portStart ?? 9222;
  const end = args.portEnd ?? 9299;
  const timeout = args.wsTimeoutMs ?? 4000;
  const discovered: { port: number; url: string; title?: string; type?: string }[] = [];
  for (let port = start; port <= end; port++) {
    let _statusLine: string;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: ctrl.signal as any,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      _statusLine = res.headers.get("x-cdp-status") ?? "ok";
    } catch {
      continue;
    }
    let targets: { id: string; title: string; type: string; url: string }[];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: ctrl.signal as any });
      clearTimeout(timer);
      if (!res.ok) continue;
      targets = (await res.json()) as { id: string; title: string; type: string; url: string }[];
    } catch {
      continue;
    }
    for (const t of targets) {
      discovered.push({ port, url: t.url, title: t.title, type: t.type });
    }
  }
  if (discovered.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No CDP targets found on ports ${start}-${end}.\nTip: launch Chrome with --remote-debugging-port=9222`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text",
        text: discovered
          .map(
            (d) =>
              `port=${d.port} type=${d.type}\n  url: ${d.url}\n  title: ${d.title ?? "(untitled)"}`,
          )
          .join("\n\n"),
      },
    ],
  };
}

interface SdkLike {
  tool: (name: string, desc: string, schema: any, handler: any) => unknown;
  createSdkMcpServer: (opts: { name: string; version: string; tools: unknown[] }) => any;
}

let sdkInstance: SdkLike | null = null;

async function loadSdk(): Promise<SdkLike | null> {
  if (sdkInstance) return sdkInstance;
  try {
    const mod = (await import("@anthropic-ai/claude-agent-sdk")) as Partial<SdkLike>;
    if (mod.tool && mod.createSdkMcpServer) {
      sdkInstance = mod as SdkLike;
      return sdkInstance;
    }
  } catch {
    // SDK not available
  }
  return null;
}

export interface GobbyToolset {
  serverInstance: unknown;
  toolNames: string[];
}

export async function buildGobbyToolset(): Promise<GobbyToolset> {
  const sdk = await loadSdk();
  const toolNames = ["index_repo", "search_code", "find_references", "cdp_discover"];
  if (!sdk) {
    return { serverInstance: null, toolNames };
  }
  const tools = [
    sdk.tool(
      "index_repo",
      "Walk the repo and build a searchable symbol/string index. Run first before search_code or find_references.",
      indexSchema,
      async (a: any) => runIndex(a),
    ),
    sdk.tool(
      "search_code",
      "Semantic/fuzzy search across the indexed codebase.",
      searchSchema,
      async (a: any) => runSearch(a),
    ),
    sdk.tool(
      "find_references",
      "Locate all references to a symbol in the indexed codebase.",
      findRefsSchema,
      async (a: any) => runFindRefs(a),
    ),
    sdk.tool(
      "cdp_discover",
      "Auto-discover Chrome DevTools Protocol targets on localhost ports.",
      cdpSchema,
      async (a: any) => runCdpDiscover(a),
    ),
  ];
  const server = sdk.createSdkMcpServer({ name: "gobby", version: "0.1.0", tools });
  return { serverInstance: server, toolNames };
}
