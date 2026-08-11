import { contextBridge, ipcRenderer } from "electron";

export type AgentStatus = "idle" | "running" | "error";
export type LogLevel = "stdout" | "stderr" | "system";

export interface AgentState {
  status: AgentStatus;
  sessionId: string | null;
  prompt: string | null;
  startedAt: number | null;
  error: string | null;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  text: string;
}

export interface ErrorEntry {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  source?: string;
}

export interface StackFrame {
  file: string;
  line: number;
  column: number;
  function: string;
  context?: string;
}

export interface DriveNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: DriveNode[];
}

export interface CdpScreenshot {
  id: string;
  timestamp: number;
  dataUrl: string;
  title?: string;
  url?: string;
}

export interface ResearchBrief {
  id: string;
  timestamp: number;
  query: string;
  sources: { title: string; url: string; snippet: string }[];
  summary: string;
}

export interface CorrectionProposal {
  id: string;
  timestamp: number;
  type: "node" | "python" | "path" | "shell" | "llm";
  message: string;
  patch?: string;
  confidence: number;
}

export interface QuantumAPI {
  agent: {
    start(prompt: string): Promise<{ ok: boolean; port?: number; error?: string }>;
    stop(): Promise<{ ok: boolean }>;
    send(text: string): Promise<{ ok: boolean }>;
    getStatus(): Promise<AgentState>;
  };
  mcp: {
    callTool(tool: string, args: Record<string, unknown>): Promise<{
      ok: boolean;
      data?: unknown;
      error?: string;
    }>;
  };
  file: {
    open(filePath: string): Promise<{ ok: boolean; error?: string }>;
    openInEditor(filePath: string, line?: number): Promise<{ ok: boolean; error?: string }>;
  };
  logs: {
    get(): Promise<LogEntry[]>;
    clear(): Promise<{ ok: boolean }>;
    onEntry(callback: (entry: LogEntry) => void): () => void;
  };
  errors: {
    get(): Promise<ErrorEntry[]>;
    onEntry(callback: (entry: ErrorEntry) => void): () => void;
  };
  stacks: {
    get(): Promise<StackFrame[]>;
    clear(): Promise<{ ok: boolean }>;
    onUpdate(callback: (frames: StackFrame[]) => void): () => void;
  };
  drive: {
    get(): Promise<DriveNode[]>;
  };
  cdp: {
    getScreenshots(): Promise<CdpScreenshot[]>;
    addScreenshot(screenshot: Omit<CdpScreenshot, "id" | "timestamp">): Promise<CdpScreenshot>;
    onNewScreenshot(callback: (screenshot: CdpScreenshot) => void): () => void;
  };
  research: {
    get(): Promise<ResearchBrief[]>;
    add(brief: Omit<ResearchBrief, "id" | "timestamp">): Promise<ResearchBrief>;
    onUpdate(callback: (briefs: ResearchBrief[]) => void): () => void;
  };
  corrections: {
    get(): Promise<CorrectionProposal[]>;
    add(correction: Omit<CorrectionProposal, "id" | "timestamp">): Promise<CorrectionProposal>;
    apply(id: string): Promise<{ ok: boolean; applied?: CorrectionProposal; error?: string }>;
    onUpdate(callback: (corrections: CorrectionProposal[]) => void): () => void;
  };
}

const api: QuantumAPI = {
  agent: {
    start: (prompt) => ipcRenderer.invoke("agent:start", prompt),
    stop: () => ipcRenderer.invoke("agent:stop"),
    send: (text) => ipcRenderer.invoke("agent:send", text),
    getStatus: () => ipcRenderer.invoke("agent:status-get"),
  },
  mcp: {
    callTool: (tool, args) => ipcRenderer.invoke("mcp:call-tool", tool, args),
  },
  file: {
    open: (filePath) => ipcRenderer.invoke("file:open", filePath),
    openInEditor: (filePath, line) => ipcRenderer.invoke("file:open-in-editor", filePath, line),
  },
  logs: {
    get: () => ipcRenderer.invoke("logs:get"),
    clear: () => ipcRenderer.invoke("logs:clear"),
    onEntry: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
      ipcRenderer.on("logs:entry", handler);
      return () => ipcRenderer.removeListener("logs:entry", handler);
    },
  },
  errors: {
    get: () => ipcRenderer.invoke("errors:get"),
    onEntry: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: ErrorEntry) => callback(entry);
      ipcRenderer.on("errors:entry", handler);
      return () => ipcRenderer.removeListener("errors:entry", handler);
    },
  },
  stacks: {
    get: () => ipcRenderer.invoke("stacks:get"),
    clear: () => ipcRenderer.invoke("stacks:clear"),
    onUpdate: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, frames: StackFrame[]) => callback(frames);
      ipcRenderer.on("stacks:update", handler);
      return () => ipcRenderer.removeListener("stacks:update", handler);
    },
  },
  drive: {
    get: () => ipcRenderer.invoke("drive:get"),
  },
  cdp: {
    getScreenshots: () => ipcRenderer.invoke("cdp:screenshot"),
    addScreenshot: (screenshot) => ipcRenderer.invoke("cdp:add-screenshot", screenshot),
    onNewScreenshot: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, screenshot: CdpScreenshot) => callback(screenshot);
      ipcRenderer.on("cdp:screenshot:new", handler);
      return () => ipcRenderer.removeListener("cdp:screenshot:new", handler);
    },
  },
  research: {
    get: () => ipcRenderer.invoke("research:get"),
    add: (brief) => ipcRenderer.invoke("research:add", brief),
    onUpdate: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, briefs: ResearchBrief[]) => callback(briefs);
      ipcRenderer.on("research:update", handler);
      return () => ipcRenderer.removeListener("research:update", handler);
    },
  },
  corrections: {
    get: () => ipcRenderer.invoke("corrections:get"),
    add: (correction) => ipcRenderer.invoke("corrections:add", correction),
    apply: (id) => ipcRenderer.invoke("corrections:apply", id),
    onUpdate: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, corrections: CorrectionProposal[]) =>
        callback(corrections);
      ipcRenderer.on("corrections:update", handler);
      return () => ipcRenderer.removeListener("corrections:update", handler);
    },
  },
};

contextBridge.exposeInMainWorld("quantumAPI", api);
