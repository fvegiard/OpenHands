import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as pty from "node-pty";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

let mainWindow: BrowserWindow | null = null;
let agentPty: pty.IPty | null = null;
let serverProcess: ChildProcess | null = null;

interface AgentState {
  status: "idle" | "running" | "error";
  sessionId: string | null;
  prompt: string | null;
  startedAt: number | null;
  error: string | null;
}

interface LogEntry {
  id: string;
  timestamp: number;
  level: "stdout" | "stderr" | "system";
  text: string;
}

interface ErrorEntry {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  source?: string;
}

interface StackFrame {
  file: string;
  line: number;
  column: number;
  function: string;
  context?: string;
}

interface DriveNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: DriveNode[];
}

interface CdpScreenshot {
  id: string;
  timestamp: number;
  dataUrl: string;
  title?: string;
  url?: string;
}

interface ResearchBrief {
  id: string;
  timestamp: number;
  query: string;
  sources: { title: string; url: string; snippet: string }[];
  summary: string;
}

interface CorrectionProposal {
  id: string;
  timestamp: number;
  type: "node" | "python" | "path" | "shell" | "llm";
  message: string;
  patch?: string;
  confidence: number;
}

const agentState: AgentState = {
  status: "idle",
  sessionId: null,
  prompt: null,
  startedAt: null,
  error: null,
};

const logs: LogEntry[] = [];
const errors: ErrorEntry[] = [];
const stacks: StackFrame[] = [];
const driveMap: DriveNode[] = [];
const screenshots: CdpScreenshot[] = [];
const researchBriefs: ResearchBrief[] = [];
const corrections: CorrectionProposal[] = [];

const MAX_LOGS = 5000;
const MAX_ERRORS = 500;
const MAX_STACKS = 200;
const MAX_SCREENSHOTS = 100;
const MAX_RESEARCH = 200;
const MAX_CORRECTIONS = 200;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function addLog(level: LogEntry["level"], text: string): void {
  const entry: LogEntry = { id: uid(), timestamp: Date.now(), level, text };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  mainWindow?.webContents.send("logs:entry", entry);
}

function addError(message: string, stack?: string): void {
  const entry: ErrorEntry = { id: uid(), timestamp: Date.now(), message, stack };
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
  mainWindow?.webContents.send("errors:entry", entry);
}

function parseAgentOutput(text: string): void {
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^\[error\]/i.test(line) || /Error:/i.test(line) || /^ERROR/i.test(line)) {
      addError(line.trim());
    }
    if (/stack|traceback|at\s+\(/i.test(line)) {
      stacks.push({
        file: "(unknown)",
        line: 0,
        column: 0,
        function: "unknown",
        context: line.trim(),
      });
      if (stacks.length > MAX_STACKS) stacks.splice(0, stacks.length - MAX_STACKS);
      mainWindow?.webContents.send("stacks:update", stacks);
    }
    if (/research|brief|source:|url:/i.test(line)) {
      researchBriefs.push({
        id: uid(),
        timestamp: Date.now(),
        query: "(auto-detected)",
        sources: [],
        summary: line.trim(),
      });
      if (researchBriefs.length > MAX_RESEARCH)
        researchBriefs.splice(0, researchBriefs.length - MAX_RESEARCH);
      mainWindow?.webContents.send("research:update", researchBriefs);
    }
    if (/correction|fix_|suggest|patch/i.test(line)) {
      corrections.push({
        id: uid(),
        timestamp: Date.now(),
        type: "llm",
        message: line.trim(),
        confidence: 0.8,
      });
      if (corrections.length > MAX_CORRECTIONS)
        corrections.splice(0, corrections.length - MAX_CORRECTIONS);
      mainWindow?.webContents.send("corrections:update", corrections);
    }
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: "Quantum Agent Dashboard",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV === "1") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "out/renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function ensureServerRunning(): Promise<number> {
  if (serverProcess && serverProcess.exitCode === null) return 8765;
  const serverBin = path.join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
  if (!fs.existsSync(serverBin)) {
    throw new Error("tsx not found — run pnpm install first");
  }
  serverProcess = spawn(
    process.execPath,
    [serverBin, "serve", "-p", "8765"],
    { cwd: PROJECT_ROOT, stdio: ["pipe", "pipe", "pipe"] }
  );
  serverProcess.stdout?.on("data", (d: Buffer) => addLog("stdout", d.toString()));
  serverProcess.stderr?.on("data", (d: Buffer) => addLog("stderr", d.toString()));
  await new Promise<void>((resolve) => {
    const check = () => {
      if (mainWindow?.webContents) resolve();
      else setTimeout(check, 200);
    };
    setTimeout(check, 500);
  });
  return 8765;
}

ipcMain.handle("agent:start", async (_event, prompt: string) => {
  try {
    const port = await ensureServerRunning();
    if (agentPty) {
      agentPty.kill();
      agentPty = null;
    }
    const quantumBin = process.execPath;
    const quantumScript = path.join(PROJECT_ROOT, "src", "cli.ts");
    agentPty = pty.spawn(quantumBin, ["--import=tsx", quantumScript, "run", prompt], {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_OPTIONS: "--import tsx" },
    });

    agentState.status = "running";
    agentState.sessionId = null;
    agentState.prompt = prompt;
    agentState.startedAt = Date.now();
    agentState.error = null;

    agentPty.onData((data: string) => {
      addLog("stdout", data);
      parseAgentOutput(data);
    });

    agentPty.onExit(({ exitCode }) => {
      agentState.status = exitCode === 0 ? "idle" : "error";
      if (exitCode !== 0) {
        agentState.error = `Process exited with code ${exitCode}`;
        addError(agentState.error);
      }
      agentPty = null;
      mainWindow?.webContents.send("agent:status", { ...agentState });
    });

    mainWindow?.webContents.send("agent:status", { ...agentState });
    return { ok: true, port };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addError(message);
    agentState.status = "error";
    agentState.error = message;
    mainWindow?.webContents.send("agent:status", { ...agentState });
    return { ok: false, error: message };
  }
});

ipcMain.handle("agent:stop", async () => {
  if (agentPty) {
    agentPty.kill("SIGTERM");
    agentPty = null;
  }
  agentState.status = "idle";
  mainWindow?.webContents.send("agent:status", { ...agentState });
  return { ok: true };
});

ipcMain.handle("agent:send", (_event, text: string) => {
  if (!agentPty || agentState.status !== "running") return { ok: false };
  agentPty.write(`${text}\r`);
  return { ok: true };
});

ipcMain.handle("agent:status-get", () => ({ ...agentState }));

ipcMain.handle("mcp:call-tool", async (_event, tool: string, args: Record<string, unknown>) => {
  try {
    const port = await ensureServerRunning();
    const res = await fetch(`http://127.0.0.1:${port}/mcp/v1/call/${encodeURIComponent(tool)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
});

ipcMain.handle("file:open", async (_event, filePath: string) => {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(PROJECT_ROOT, filePath);
    await shell.openPath(fullPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("file:open-in-editor", async (_event, filePath: string, line?: number) => {
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(PROJECT_ROOT, filePath);
    const editor = process.env.EDITOR || process.env.VISUAL || "code";
    const args = line ? [fullPath, `--goto`, `${fullPath}:${line}`] : [fullPath];
    const cp = spawn(editor, args, { cwd: PROJECT_ROOT, detached: true });
    cp.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("logs:get", () => logs.slice(-200));
ipcMain.handle("logs:clear", () => {
  logs.length = 0;
  return { ok: true };
});

ipcMain.handle("errors:get", () => errors.slice(-100));
ipcMain.handle("stacks:get", () => stacks.slice(-100));
ipcMain.handle("stacks:clear", () => {
  stacks.length = 0;
  return { ok: true };
});

ipcMain.handle("drive:get", async () => {
  try {
    const projectPath = PROJECT_ROOT;
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    const nodes: DriveNode[] = items
      .filter((d) => !d.name.startsWith(".") || d.name === ".git")
      .map((d) => {
        const full = path.join(projectPath, d.name);
        try {
          const stat = fs.statSync(full);
          return {
            name: d.name,
            path: full,
            type: d.isDirectory() ? ("dir" as const) : ("file" as const),
            size: stat.size,
          };
        } catch {
          return { name: d.name, path: full, type: d.isDirectory() ? ("dir" as const) : ("file" as const) };
        }
      });
    driveMap.length = 0;
    driveMap.push(...nodes);
    return driveMap;
  } catch {
    return driveMap;
  }
});

ipcMain.handle("cdp:screenshot", async () => {
  return screenshots.slice(-20);
});

ipcMain.handle("cdp:add-screenshot", async (_event, screenshot: Omit<CdpScreenshot, "id" | "timestamp">) => {
  const entry: CdpScreenshot = { id: uid(), timestamp: Date.now(), ...screenshot };
  screenshots.push(entry);
  if (screenshots.length > MAX_SCREENSHOTS) screenshots.splice(0, screenshots.length - MAX_SCREENSHOTS);
  mainWindow?.webContents.send("cdp:screenshot:new", entry);
  return entry;
});

ipcMain.handle("research:get", () => researchBriefs.slice(-50));
ipcMain.handle("research:add", async (_event, brief: Omit<ResearchBrief, "id" | "timestamp">) => {
  const entry: ResearchBrief = { id: uid(), timestamp: Date.now(), ...brief };
  researchBriefs.push(entry);
  if (researchBriefs.length > MAX_RESEARCH)
    researchBriefs.splice(0, researchBriefs.length - MAX_RESEARCH);
  mainWindow?.webContents.send("research:update", researchBriefs);
  return entry;
});

ipcMain.handle("corrections:get", () => corrections.slice(-50));
ipcMain.handle("corrections:add", async (_event, correction: Omit<CorrectionProposal, "id" | "timestamp">) => {
  const entry: CorrectionProposal = { id: uid(), timestamp: Date.now(), ...correction };
  corrections.push(entry);
  if (corrections.length > MAX_CORRECTIONS)
    corrections.splice(0, corrections.length - MAX_CORRECTIONS);
  mainWindow?.webContents.send("corrections:update", corrections);
  return entry;
});

ipcMain.handle("corrections:apply", async (_event, id: string) => {
  const idx = corrections.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: "not found" };
  const c = corrections[idx];
  if (!c) return { ok: false, error: "not found" };
  corrections.splice(idx, 1);
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("corrections:update", corrections);
  }
  if (c.patch) {
    addLog("system", `Applied correction: ${c.type} — ${c.message}`);
  }
  return { ok: true, applied: c };
});

ipcMain.handle("corrections:dismiss", async (_event, id: string) => {
  const idx = corrections.findIndex((c) => c.id === id);
  if (idx === -1) return { ok: false, error: "not found" };
  const c = corrections[idx];
  corrections.splice(idx, 1);
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("corrections:update", corrections);
  }
  return { ok: true, dismissed: c };
});

app.whenReady().then(() => {
  createWindow();
  addLog("system", "Quantum Agent Dashboard ready");
});

app.on("window-all-closed", () => {
  if (agentPty) agentPty.kill();
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
