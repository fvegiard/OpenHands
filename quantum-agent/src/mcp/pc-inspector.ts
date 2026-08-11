#!/usr/bin/env tsx
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  arch as osArch,
  cpus as osCpus,
  freemem as osFreemem,
  platform as osPlatform,
  totalmem as osTotalmem,
} from "node:os";
import { createInterface } from "node:readline";
import { execaSync } from "execa";
import { z } from "zod";

// ============================================================================
// Tool Schemas (Zod)
// ============================================================================

const MapDriveInput = z.object({
  path: z.string().default("."),
  maxDepth: z.number().int().positive().max(20).default(3),
});

const SystemInfoInput = z.object({});

const ListProcessesInput = z.object({});

const CheckEnvironmentInput = z.object({});

const ValidatePathsInput = z.object({
  paths: z.array(z.string()).min(1),
});

const DetectShellInput = z.object({});

// ============================================================================
// Tool Logic (exported for testing)
// ============================================================================

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function runMapDrive(input: unknown): ToolResult {
  const args = MapDriveInput.parse(input ?? {});
  const { path, maxDepth } = args;
  const root = path;

  function walk(dir: string, depth: number, prefix: string): string {
    if (depth > maxDepth) return `${prefix}...\n`;
    let output = "";
    try {
      const entries = readdirSync(dir);
      const dirs: string[] = [];
      const files: { name: string; size: number }[] = [];

      for (const entry of entries) {
        const full = `${dir}/${entry}`.replace(/\/+/g, "/");
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            dirs.push(entry);
          } else {
            files.push({ name: entry, size: stat.size });
          }
        } catch {
          files.push({ name: entry, size: 0 });
        }
      }

      const all = [...dirs, ...files];
      all.forEach((entry, idx) => {
        const isLast = idx === all.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const nextPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;

        if (typeof entry === "string") {
          output += `${prefix}${connector}${entry}/\n`;
          output += walk(`${dir}/${entry}`.replace(/\/+/g, "/"), depth + 1, nextPrefix);
        } else {
          output += `${prefix}${connector}${entry.name} (${formatBytes(entry.size)})\n`;
        }
      });
    } catch (err) {
      output += `${prefix}[error: ${(err as Error).message}]\n`;
    }
    return output;
  }

  const tree = `${root}/\n${walk(root, 1, "")}`;
  return { content: [{ type: "text", text: tree }] };
}

export function runSystemInfo(_input: unknown): ToolResult {
  const cpuList = osCpus();
  const totalMemBytes = osTotalmem();
  const freeMemBytes = osFreemem();
  const osPlat = osPlatform();

  const diskUsage: {
    filesystem: string;
    mountpoint: string;
    total: string;
    used: string;
    free: string;
  }[] = [];
  try {
    let result: { stdout: string };
    try {
      result = execaSync("df", ["-h", "--output=source,size,used,avail,pcent,target"], {
        encoding: "utf8",
        reject: false,
      });
    } catch {
      result = execaSync("df", ["-h"], { encoding: "utf8", reject: false });
    }
    const lines = result.stdout.split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6 && parts[0]?.startsWith("/dev/")) {
        diskUsage.push({
          filesystem: parts[0],
          mountpoint: parts[parts.length - 1] ?? "unknown",
          total: parts[1] ?? "0",
          used: parts[2] ?? "0",
          free: parts[3] ?? "0",
        });
      }
    }
  } catch {
    // fallback: no disk info available
  }

  const text = [
    `OS: ${osPlat} ${osArch()}`,
    `Arch: ${osArch()}`,
    `CPU:`,
    `  Model: ${cpuList[0]?.model ?? "unknown"}`,
    `  Cores: ${cpuList.length}`,
    `Memory:`,
    `  Total: ${formatBytes(totalMemBytes)}`,
    `  Free: ${formatBytes(freeMemBytes)}`,
    `Disk:`,
    ...diskUsage.map(
      (d) =>
        `  ${d.filesystem} mounted on ${d.mountpoint} (total: ${d.total}, used: ${d.used}, free: ${d.free})`,
    ),
  ].join("\n");

  return { content: [{ type: "text", text }] };
}

export function runListProcesses(_input: unknown): ToolResult {
  const processes: { pid: number; command: string; cpu: string; mem: string; ports: number[] }[] =
    [];
  const pidToPorts = new Map<number, number[]>();

  try {
    const ss = execaSync("ss", ["-tlnp"], { encoding: "utf8", reject: false });
    const lines = ss.stdout.split("\n");
    for (const line of lines) {
      const match = line.match(/(?:\[::\]|\*|[\d.a-fA-F]+):(\d+)\s+.*users:\(\("(.+?)",pid=(\d+)/);
      if (match) {
        const port = parseInt(match[1] ?? "0", 10);
        const pid = parseInt(match[3] ?? "0", 10);
        const existing = pidToPorts.get(pid) ?? [];
        existing.push(port);
        pidToPorts.set(pid, existing);
      }
    }
  } catch {
    // ss not available
  }

  try {
    const ps = execaSync("ps", ["aux"], { encoding: "utf8", reject: false });
    const lines = ps.stdout.split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11) {
        const pid = parseInt(parts[1] ?? "0", 10);
        const cpu = parts[2] ?? "0";
        const mem = parts[3] ?? "0";
        const command = parts.slice(10).join(" ");
        processes.push({
          pid,
          command: command.slice(0, 100),
          cpu: `${cpu}%`,
          mem: `${mem}%`,
          ports: pidToPorts.get(pid) ?? [],
        });
      }
    }
  } catch {
    // ps not available
  }

  const text = processes
    .map(
      (p) =>
        `PID: ${p.pid}\n  Command: ${p.command}\n  CPU: ${p.cpu}  MEM: ${p.mem}${p.ports.length > 0 ? `\n  Ports: ${p.ports.join(", ")}` : ""}`,
    )
    .join("\n\n");

  return { content: [{ type: "text", text: text || "(no processes found)" }] };
}

export function runCheckEnvironment(_input: unknown): ToolResult {
  const env: Record<string, string> = {};

  env.PATH = process.env.PATH ?? "";
  env.HOME = process.env.HOME ?? "";
  env.SHELL = process.env.SHELL ?? "";
  env.COMSPEC = process.env.COMSPEC ?? "";

  const versions: Record<string, string> = {};

  function checkVersion(cmd: string, args: string[]): void {
    try {
      const result = execaSync(cmd, args, { reject: false, encoding: "utf8", timeout: 5000 });
      if (result.exitCode === 0) {
        versions[cmd] = result.stdout.trim();
      } else {
        versions[cmd] = `not installed (exit ${result.exitCode})`;
      }
    } catch {
      versions[cmd] = "not installed";
    }
  }

  checkVersion("node", ["--version"]);
  checkVersion("python3", ["--version"]);
  checkVersion("python", ["--version"]);
  checkVersion("rustc", ["--version"]);
  checkVersion("go", ["version"]);

  const text = [
    "Environment variables:",
    `  PATH: ${env.PATH}`,
    `  HOME: ${env.HOME}`,
    `  SHELL: ${env.SHELL}`,
    `  COMSPEC: ${env.COMSPEC}`,
    "",
    "Tool versions:",
    ...Object.entries(versions).map(([k, v]) => `  ${k}: ${v}`),
  ].join("\n");

  return { content: [{ type: "text", text }] };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] as number;
      } else {
        curr[j] = Math.min(
          (prev[j - 1] as number) + 1,
          (curr[j - 1] as number) + 1,
          (prev[j] as number) + 1,
        );
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return (prev[n] as number) ?? 0;
}

const COMMON_PATHS = [
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/local/sbin",
  "/usr/sbin",
  "/sbin",
  "/home",
  "/root",
  "/tmp",
  "/var",
  "/etc",
  "/opt",
  "/home/user",
  "/Users/user",
  "/home/user/projects",
  "./src",
  "./dist",
  "./node_modules",
  "./tests",
  "./test",
  "package.json",
  "tsconfig.json",
  "README.md",
];

export function runValidatePaths(input: unknown): ToolResult {
  const args = ValidatePathsInput.parse(input ?? {});
  const results = args.paths.map((p) => {
    let exists = false;
    try {
      exists = existsSync(p);
    } catch {
      exists = false;
    }
    let suggestion: string | null = null;
    if (!exists) {
      const normalized = p.replace(/\/$/, "");
      let best: { candidate: string; dist: number } | null = null;
      for (const candidate of COMMON_PATHS) {
        const dist = levenshtein(normalized.toLowerCase(), candidate.toLowerCase());
        if (!best || dist < best.dist) {
          best = { candidate, dist };
        }
      }
      if (best && best.dist <= Math.max(2, Math.floor(normalized.length * 0.3))) {
        suggestion = best.candidate;
      }
    }
    return { path: p, exists, suggestion };
  });

  const text = results
    .map(
      (r) =>
        `${r.path}: ${r.exists ? "EXISTS" : "MISSING"}${r.suggestion ? ` — did you mean ${r.suggestion}?` : ""}`,
    )
    .join("\n");

  return { content: [{ type: "text", text }] };
}

export function runDetectShell(_input: unknown): ToolResult {
  const shell = process.env.SHELL ?? process.env.COMSPEC ?? "unknown";
  const rcFiles: string[] = [];

  const shellName = shell.split("/").pop() ?? shell;

  const rcMap: Record<string, string[]> = {
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

  const candidates = rcMap[shellName] ?? [];
  const home = process.env.HOME ?? "";

  for (const rc of candidates) {
    let full: string;
    if (rc.startsWith("$PROFILE")) {
      const pwshProfile =
        process.env.PWsh_PROFILE ?? `${home}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`;
      full = pwshProfile;
    } else if (rc.startsWith("$")) {
      full = process.env[rc.slice(1)] ?? rc;
    } else {
      full = `${home}/${rc}`;
    }
    if (full) {
      try {
        if (existsSync(full)) {
          rcFiles.push(full);
        }
      } catch {
        // ignore
      }
    }
  }

  const text = [
    `Shell: ${shellName}`,
    `Path: ${shell}`,
    `RC files:`,
    ...(rcFiles.length > 0 ? rcFiles.map((f) => `  ${f}`) : ["  (none found)"]),
  ].join("\n");

  return { content: [{ type: "text", text }] };
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
    name: "map_drive",
    description: "Recursive directory tree up to a configurable depth with file stats.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Root directory to map", default: "." },
        maxDepth: {
          type: "number",
          description: "Maximum recursion depth (1-20)",
          default: 3,
        },
      },
    },
    handler: runMapDrive,
  },
  {
    name: "system_info",
    description: "Return OS, architecture, CPU, RAM, and disk usage.",
    inputSchema: { type: "object", properties: {} },
    handler: runSystemInfo,
  },
  {
    name: "list_processes",
    description: "List running processes with PIDs, CPU/MEM, and listening ports.",
    inputSchema: { type: "object", properties: {} },
    handler: runListProcesses,
  },
  {
    name: "check_environment",
    description: "Return PATH, HOME, SHELL, and Node/Python/Rust/Go versions.",
    inputSchema: { type: "object", properties: {} },
    handler: runCheckEnvironment,
  },
  {
    name: "validate_paths",
    description:
      "Check if paths exist and suggest corrections for common typos (Levenshtein distance).",
    inputSchema: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["paths"],
    },
    handler: runValidatePaths,
  },
  {
    name: "detect_shell",
    description: "Identify the active shell and its RC configuration files.",
    inputSchema: { type: "object", properties: {} },
    handler: runDetectShell,
  },
];

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  map_drive: MapDriveInput,
  system_info: SystemInfoInput,
  list_processes: ListProcessesInput,
  check_environment: CheckEnvironmentInput,
  validate_paths: ValidatePathsInput,
  detect_shell: DetectShellInput,
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
        serverInfo: { name: "pc-inspector", version: "0.1.0" },
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
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      await handleMessage(trimmed);
    } catch (err) {
      console.error("[pc-inspector] handler error:", err);
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: (err as Error).message },
      });
    }
  }
}

main().catch((err) => {
  console.error("[pc-inspector] fatal:", err);
  process.exit(1);
});
