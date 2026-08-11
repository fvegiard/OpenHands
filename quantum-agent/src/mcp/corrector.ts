#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { execaSync } from "execa";
import { z } from "zod";
import { runGrep } from "../tools/repo.ts";
import type { ToolResult } from "../tools/shell.ts";
import { autoWebSearch, type SearchHit } from "../tools/web.ts";

// ============================================================================
// Tool Schemas (Zod)
// ============================================================================

const FixNodeVersionInput = z.object({
  root: z.string().default(".").optional(),
  autoRun: z.boolean().default(false).optional(),
});

const FixPythonVersionInput = z.object({
  root: z.string().default(".").optional(),
  autoRun: z.boolean().default(false).optional(),
});

const FixPathInput = z.object({
  missing: z.array(z.string()).optional(),
  shell: z.string().optional(),
});

const FixShellSyntaxInput = z.object({
  script: z.string().min(1),
  autoFix: z.boolean().default(false).optional(),
});

const LlmCorrectionInput = z.object({
  errorMessage: z.string().min(1),
  stackTrace: z.string().optional(),
  query: z.string().optional(),
  repoSearch: z.boolean().default(true).optional(),
  webSearch: z.boolean().default(true).optional(),
});

// ============================================================================
// Helpers
// ============================================================================

function detectFromFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8").trim();
    if (!text) return null;
    const firstLine = text.split("\n")[0]?.trim() ?? "";
    if (!firstLine) return null;
    return firstLine;
  } catch {
    return null;
  }
}

function resolveProjectRoot(root: string = "."): string {
  return require("node:path").resolve(root);
}

const SHELL_RC_MAP: Record<string, string[]> = {
  bash: [".bashrc", ".bash_profile", ".bash_login", ".profile"],
  zsh: [".zshrc", ".zprofile", ".zshenv"],
  fish: [".config/fish/config.fish"],
  sh: [".profile"],
  dash: [".profile"],
  ksh: [".kshrc", ".profile"],
  tcsh: [".tcshrc", ".cshrc"],
  csh: [".cshrc"],
  pwsh: ["$PROFILE"],
  powershell: ["$PROFILE"],
};

const COMMON_PATH_ENTRIES = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/local/sbin",
  "/usr/sbin",
  "/sbin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/go/bin",
  "$HOME/.cargo/bin",
  "$HOME/.npm-global/bin",
  "$HOME/.local/bin",
  "$HOME/.fnm",
  "./node_modules/.bin",
  "./venv/bin",
  "./.venv/bin",
];

const _SHELL_COMMON_ERROR_PATTERNS: { regex: RegExp; hint: string }[] = [
  {
    regex: /syntax error near unexpected token `([^']+)'/i,
    hint: "Check for unquoted strings or missing semicolons.",
  },
  { regex: /command not found/i, hint: "Verify the binary exists in PATH or install it." },
  { regex: /no such file or directory/i, hint: "Check the path spelling and permissions." },
  { regex: /permission denied/i, hint: "Check file permissions (`chmod +x <file>`)." },
  {
    regex: /unexpected EOF while parsing/i,
    hint: "Missing closing quote, bracket, or `fi`/`done`/`esac`.",
  },
  { regex: /cannot find symbol/i, hint: `Review variable quoting (\`$var\` vs \`\${var}\`).` },
];

// ============================================================================
// Tool Logic (exported for testing)
// ============================================================================

export function runFixNodeVersion(input: unknown): ToolResult {
  const args = FixNodeVersionInput.parse(input ?? {});
  const root = resolveProjectRoot(args.root ?? ".");
  const candidates = [
    { path: `${root}/.nvmrc`, label: ".nvmrc" },
    { path: `${root}/.node-version`, label: ".node-version" },
  ];

  let detected: string | null = null;
  let source = "not found";
  for (const c of candidates) {
    const v = detectFromFile(c.path);
    if (v) {
      detected = v;
      source = c.label;
      break;
    }
  }

  if (!detected) {
    try {
      const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
      const engines = pkg.engines?.node;
      if (engines) {
        detected = engines;
        source = "package.json engines.node";
      }
    } catch {
      // ignore
    }
  }

  const suggestions: string[] = [];
  let ran: string | null = null;

  const hasNvm = (() => {
    try {
      const r = execaSync("bash", ["-lc", "command -v nvm"], { reject: false, encoding: "utf8" });
      return r.exitCode === 0 && r.stdout.trim().length > 0;
    } catch {
      return false;
    }
  })();

  const hasFnm = (() => {
    try {
      const r = execaSync("bash", ["-lc", "command -v fnm"], { reject: false, encoding: "utf8" });
      return r.exitCode === 0 && r.stdout.trim().length > 0;
    } catch {
      return false;
    }
  })();

  if (detected) {
    const safeVersion = /^[\d.]+$/.test(detected) ? detected : null;
    if (hasNvm) {
      suggestions.push(`nvm use ${detected}`);
      if (args.autoRun && safeVersion) {
        try {
          const r = execaSync("bash", ["-lc", `nvm use ${safeVersion}`], {
            reject: false,
            encoding: "utf8",
            cwd: root,
          });
          ran = `nvm use ${safeVersion}\n${r.stdout}\n${r.stderr}`;
        } catch (err) {
          ran = `nvm use ${safeVersion} failed: ${(err as Error).message}`;
        }
      }
    } else if (hasFnm) {
      suggestions.push(`fnm use ${detected}`);
      if (args.autoRun && safeVersion) {
        try {
          const r = execaSync("bash", ["-lc", `fnm use ${safeVersion}`], {
            reject: false,
            encoding: "utf8",
            cwd: root,
          });
          ran = `fnm use ${safeVersion}\n${r.stdout}\n${r.stderr}`;
        } catch (err) {
          ran = `fnm use ${safeVersion} failed: ${(err as Error).message}`;
        }
      }
    } else {
      suggestions.push(
        `Install nvm (https://github.com/nvm-sh/nvm) or fnm (https://github.com/Schniz/fnm) and run: nvm/fnm use ${detected}`,
      );
    }
  }

  const text = [
    `Detected Node version: ${detected ?? "none"} (source: ${source})`,
    ...(suggestions.length > 0 ? [`Suggestions:`, ...suggestions.map((s) => `  - ${s}`)] : []),
    ...(ran ? [`Execution result:\n${ran}`] : []),
  ].join("\n");

  return { content: [{ type: "text", text }] };
}

export function runFixPythonVersion(input: unknown): ToolResult {
  const args = FixPythonVersionInput.parse(input ?? {});
  const root = resolveProjectRoot(args.root ?? ".");

  let detected: string | null = null;
  let source = "not found";

  const pyprojectVersion = (() => {
    try {
      const text = readFileSync(`${root}/pyproject.toml`, "utf8");
      const m = text.match(/requires-python\s*=\s*["']([^"']+)["']/);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  })();

  if (pyprojectVersion) {
    detected = pyprojectVersion;
    source = "pyproject.toml requires-python";
  } else {
    const runtimeVersion = detectFromFile(`${root}/runtime.txt`);
    if (runtimeVersion) {
      detected = runtimeVersion;
      source = "runtime.txt";
    } else {
      const pyVersion = detectFromFile(`${root}/.python-version`);
      if (pyVersion) {
        detected = pyVersion;
        source = ".python-version";
      }
    }
  }

  const suggestions: string[] = [];
  let ran: string | null = null;

  if (detected) {
    const match = detected.match(/[\d.]+/);
    const spec = match?.[0] ?? null;
    if (spec) {
      suggestions.push(`python${spec.startsWith("3") ? "3" : ""} --version`);

      if (args.autoRun) {
        try {
          const pyCmd = spec.startsWith("3") ? "python3" : "python";
          const r = execaSync(pyCmd, ["--version"], { reject: false, encoding: "utf8", cwd: root });
          if (r.exitCode === 0) {
            ran = `${pyCmd} --version -> ${r.stdout.trim()}`;
          } else {
            ran = `${pyCmd} --version failed with exit ${r.exitCode}`;
          }
        } catch (err) {
          ran = `${spec} not found: ${(err as Error).message}`;
        }
      }

      suggestions.push(`Create venv with: python${spec.startsWith("3") ? "3" : ""} -m venv .venv`);
      suggestions.push(
        `Activate: source .venv/bin/activate  (Unix) or .venv\\Scripts\\activate  (Windows)`,
      );
    }
  }

  const text = [
    `Detected Python version: ${detected ?? "none"} (source: ${source})`,
    ...(suggestions.length > 0 ? [`Suggestions:`, ...suggestions.map((s) => `  - ${s}`)] : []),
    ...(ran ? [`Execution result:\n${ran}`] : []),
  ].join("\n");

  return { content: [{ type: "text", text }] };
}

export function runFixPath(input: unknown): ToolResult {
  const args = FixPathInput.parse(input ?? {});
  const rawPath = process.env.PATH ?? "";
  const pathEntries = rawPath.split(require("node:path").delimiter);
  const missing = (args.missing ?? []).filter((p) => !pathEntries.includes(p));

  const shellName =
    (process.env.SHELL ?? process.env.COMSPEC ?? "unknown").split("/").pop() ?? "unknown";
  const shell = args.shell ?? shellName;
  const rcFiles = SHELL_RC_MAP[shell] ?? [];
  const home = process.env.HOME ?? "";

  const lines: string[] = [`Shell: ${shell}`, `PATH entries: ${pathEntries.length}`, ""];

  const explicitMissing = missing.filter((p) => !pathEntries.includes(p));
  const detectedIssues: string[] = [];
  for (const entry of COMMON_PATH_ENTRIES) {
    const expanded = entry.replace(/\$HOME/g, home).replace(/\$USER/g, process.env.USER ?? "user");
    const exists = pathEntries.some((p) => p === expanded || p === entry);
    if (!exists) {
      detectedIssues.push(expanded || entry);
    }
  }
  const allMissing = [...new Set([...explicitMissing, ...detectedIssues])];

  if (allMissing.length > 0) {
    lines.push("Missing PATH entries:");
    for (const entry of allMissing) {
      lines.push(`  - ${entry}`);
    }
    lines.push("");
    lines.push("Suggested shell RC edits:");
    for (const rc of rcFiles) {
      const full = rc.startsWith("$PROFILE")
        ? (process.env.PWsh_PROFILE ??
          `${home}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`)
        : rc.startsWith("$")
          ? (process.env[rc.slice(1)] ?? rc)
          : `${home}/${rc}`;
      for (const entry of allMissing) {
        lines.push(`  echo 'export PATH="${entry}:$PATH"' >> ${full}`);
      }
    }
  } else {
    lines.push("No missing common PATH entries detected.");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

function shellcheckHeuristic(script: string): { line: number; message: string }[] {
  const issues: { line: number; message: string }[] = [];
  const lines = script.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes("$") && !line.includes("${") && /[A-Za-z_]\w*/.test(line)) {
      const unquoted = line.match(/\$[A-Za-z_]\w*/g);
      if (unquoted && unquoted.length > 0) {
        issues.push({
          line: i + 1,
          message: `Possible unquoted variable expansion: ${unquoted.join(", ")}`,
        });
      }
    }
    if (
      /[|&;]/.test(line) &&
      !line.includes("then") &&
      !line.includes("do") &&
      line.trim().length > 80
    ) {
      issues.push({
        line: i + 1,
        message: "Long line with shell metacharacters — consider breaking up.",
      });
    }
  }
  return issues;
}

export function runFixShellSyntax(input: unknown): ToolResult {
  const args = FixShellSyntaxInput.parse(input ?? {});
  const script = args.script;

  let shellcheckAvailable = false;
  try {
    const r = execaSync("bash", ["-lc", "command -v shellcheck"], {
      reject: false,
      encoding: "utf8",
    });
    shellcheckAvailable = r.exitCode === 0 && r.stdout.trim().length > 0;
  } catch {
    // ignore
  }

  const issues: { line: number; message: string; source: string }[] = [];

  if (shellcheckAvailable) {
    try {
      const r = execaSync("shellcheck", ["-f", "gcc", "-"], {
        input: script,
        reject: false,
        encoding: "utf8",
      });
      if (r.stdout.trim()) {
        for (const line of r.stdout.trim().split("\n")) {
          const m = line.match(/(.+?):(\d+):(\d+):\s*(.+)/);
          if (m) {
            issues.push({
              line: parseInt(m[2] ?? "0", 10),
              message: m[4] ?? "",
              source: "shellcheck",
            });
          }
        }
      }
    } catch {
      // shellcheck returned non-zero or failed
    }
  }

  if (issues.length === 0) {
    for (const issue of shellcheckHeuristic(script)) {
      issues.push({ ...issue, source: "heuristic" });
    }
  }

  const text =
    issues.length === 0
      ? "No issues detected."
      : [
          `Shellcheck available: ${shellcheckAvailable}`,
          `Issues found: ${issues.length}`,
          ...issues.slice(0, 50).map((i) => `  line ${i.line}: [${i.source}] ${i.message}`),
        ].join("\n");

  return { content: [{ type: "text", text }] };
}

export async function runLlmCorrection(input: unknown): Promise<ToolResult> {
  const args = LlmCorrectionInput.parse(input ?? {});
  const errorMessage = args.errorMessage;
  const stackTrace = args.stackTrace ?? "";
  const query = args.query ?? errorMessage;

  const webHits: SearchHit[] = [];
  if (args.webSearch) {
    try {
      const report = await autoWebSearch(query, 5);
      webHits.push(...report.results);
    } catch {
      // ignore web search failures
    }
  }

  const repoHits: { file: string; line: number; text: string }[] = [];
  if (args.repoSearch) {
    try {
      const terms = errorMessage
        .split(/[\s:]+/)
        .filter((t) => t.length > 3)
        .slice(0, 5);
      for (const term of terms) {
        try {
          const result = await runGrep({ pattern: term, path: "src" });
          const text = result.content[0]?.text ?? "";
          for (const line of text.split("\n").slice(0, 20)) {
            const m = line.match(/^(.+?):(\d+):\s*(.+)$/);
            if (m) {
              repoHits.push({ file: m[1]!, line: parseInt(m[2] ?? "0", 10), text: m[3]! });
            }
          }
        } catch {
          // ignore grep failures
        }
      }
    } catch {
      // ignore
    }
  }

  const lines: string[] = [
    `# LLM Correction Proposal`,
    `Query: ${query}`,
    `Web hits: ${webHits.length}`,
    `Repo hits: ${repoHits.length}`,
    "",
  ];

  if (webHits.length > 0) {
    lines.push("## Web context");
    for (const hit of webHits.slice(0, 5)) {
      lines.push(`- [${hit.title}](${hit.url})`);
      lines.push(`  ${hit.snippet.slice(0, 180)}`);
    }
    lines.push("");
  }

  if (repoHits.length > 0) {
    lines.push("## Repo references");
    for (const hit of repoHits.slice(0, 10)) {
      lines.push(`- ${hit.file}:${hit.line}: ${hit.text.slice(0, 120)}`);
    }
    lines.push("");
  }

  lines.push("## Suggested patch");
  lines.push("```diff");
  lines.push(`+ Review the error: ${errorMessage.slice(0, 200)}`);
  if (stackTrace) {
    lines.push(`+ Stack trace hint: ${stackTrace.split("\n").slice(0, 3).join(" ")}`);
  }
  lines.push("+ Apply targeted changes based on the web/repo context above.");
  lines.push("```");

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// ============================================================================
// MCP Stdio Server
// ============================================================================

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const TOOLS = [
  {
    name: "fix_node_version",
    description:
      "Detect the required Node version from .nvmrc, .node-version, or package.json engines and suggest or run nvm/fnm use.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Project root", default: "." },
        autoRun: { type: "boolean", description: "Attempt to run nvm/fnm use", default: false },
      },
    },
    handler: runFixNodeVersion,
  },
  {
    name: "fix_python_version",
    description:
      "Detect the required Python version from pyproject.toml, runtime.txt, or .python-version and suggest the correct venv/python.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Project root", default: "." },
        autoRun: { type: "boolean", description: "Verify with python --version", default: false },
      },
    },
    handler: runFixPythonVersion,
  },
  {
    name: "fix_path",
    description: "Detect missing PATH entries and suggest shell rc edits.",
    inputSchema: {
      type: "object",
      properties: {
        missing: { type: "array", items: { type: "string" } },
        shell: { type: "string", description: "Override shell rc lookup" },
      },
    },
    handler: runFixPath,
  },
  {
    name: "fix_shell_syntax",
    description:
      "Lint shell scripts with shellcheck if available, otherwise use a regex-based heuristic.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "Shell script content to lint" },
        autoFix: { type: "boolean", description: "Attempt to auto-fix (future)", default: false },
      },
      required: ["script"],
    },
    handler: runFixShellSyntax,
  },
  {
    name: "llm_correction",
    description:
      "Given an error message and optional stack trace, search the web and repo to propose a patch.",
    inputSchema: {
      type: "object",
      properties: {
        errorMessage: { type: "string", description: "The error message" },
        stackTrace: { type: "string", description: "Optional stack trace" },
        query: { type: "string", description: "Override search query" },
        repoSearch: { type: "boolean", description: "Search repo for references", default: true },
        webSearch: { type: "boolean", description: "Search web for context", default: true },
      },
      required: ["errorMessage"],
    },
    handler: runLlmCorrection,
  },
];

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  fix_node_version: FixNodeVersionInput,
  fix_python_version: FixPythonVersionInput,
  fix_path: FixPathInput,
  fix_shell_syntax: FixShellSyntaxInput,
  llm_correction: LlmCorrectionInput,
};

function send(msg: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

export async function handleMessage(raw: string): Promise<void> {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(raw);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "corrector", version: "0.1.0" },
      },
    });
    return;
  }

  if (msg.method === "notifications/initialized") {
    return;
  }

  if (msg.method === "tools/list") {
    const tools = TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    send({ jsonrpc: "2.0", id: msg.id, result: { tools } });
    return;
  }

  if (msg.method === "tools/call") {
    const params = (msg.params as { name?: string; arguments?: unknown } | null | undefined) ?? {};
    const toolName = params.name;
    const tool = TOOLS.find((t) => t.name === toolName);
    if (!tool || !toolName) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Tool not found: ${toolName}` },
      });
      return;
    }

    const schema = SCHEMAS[toolName]!;
    let parsed: unknown;
    try {
      parsed = schema.parse(params.arguments ?? {});
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.issues.map((e) => e.message).join(", ")
          : (err as Error).message;
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: `Input validation error: ${message}` }],
          isError: true,
        },
      });
      return;
    }

    const result = await tool.handler(parsed);
    send({ jsonrpc: "2.0", id: msg.id, result });
    return;
  }

  send({
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  });
}

async function main(): Promise<void> {
  const rl = await import("node:readline").then((m) =>
    m.createInterface({ input: process.stdin, output: process.stdout, terminal: false }),
  );

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      await handleMessage(trimmed);
    } catch (err) {
      console.error("[corrector] handler error:", err);
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: (err as Error).message },
      });
    }
  }
}

main().catch((err) => {
  console.error("[corrector] fatal:", err);
  process.exit(1);
});
