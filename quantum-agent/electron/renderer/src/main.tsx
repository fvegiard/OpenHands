import React from "react";
import ReactDOM from "react-dom/client";
import type {
  AgentState,
  CdpScreenshot,
  CorrectionProposal,
  ErrorEntry,
  LogEntry,
  QuantumAPI,
  ResearchBrief,
  StackFrame,
} from "../preload.ts";
import App from "./App";
import "./styles.css";

const previewUnavailableMessage = "Electron preload API is unavailable in browser preview.";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function installBrowserPreviewApi() {
  if (typeof window.quantumAPI !== "undefined") return;

  let agentState: AgentState = {
    status: "idle",
    sessionId: null,
    prompt: null,
    startedAt: null,
    error: null,
  };
  const logs: LogEntry[] = [
    {
      id: makeId("log"),
      timestamp: Date.now(),
      level: "system",
      text: "Browser preview mode: Electron IPC is not connected.",
    },
  ];
  const errors: ErrorEntry[] = [];
  let stacks: StackFrame[] = [];
  const screenshots: CdpScreenshot[] = [];
  let researchBriefs: ResearchBrief[] = [];
  let corrections: CorrectionProposal[] = [];

  const statusSubscribers = new Set<(status: AgentState) => void>();
  const logSubscribers = new Set<(entry: LogEntry) => void>();
  const errorSubscribers = new Set<(entry: ErrorEntry) => void>();
  const stackSubscribers = new Set<(frames: StackFrame[]) => void>();
  const screenshotSubscribers = new Set<(screenshot: CdpScreenshot) => void>();
  const researchSubscribers = new Set<(briefs: ResearchBrief[]) => void>();
  const correctionSubscribers = new Set<(items: CorrectionProposal[]) => void>();

  const addLog = (level: LogEntry["level"], text: string) => {
    const entry = { id: makeId("log"), timestamp: Date.now(), level, text };
    logs.push(entry);
    for (const subscriber of logSubscribers) subscriber(entry);
  };

  const addError = (message: string) => {
    const entry = {
      id: makeId("error"),
      timestamp: Date.now(),
      message,
      source: "browser-preview",
    };
    errors.push(entry);
    for (const subscriber of errorSubscribers) subscriber(entry);
  };

  const setAgentState = (next: AgentState) => {
    agentState = next;
    for (const subscriber of statusSubscribers) subscriber(next);
  };

  const api: QuantumAPI = {
    agent: {
      start: async (prompt) => {
        addLog("stderr", previewUnavailableMessage);
        addError(previewUnavailableMessage);
        setAgentState({
          status: "error",
          sessionId: null,
          prompt,
          startedAt: Date.now(),
          error: previewUnavailableMessage,
        });
        return { ok: false, error: previewUnavailableMessage };
      },
      stop: async () => {
        setAgentState({
          status: "idle",
          sessionId: null,
          prompt: null,
          startedAt: null,
          error: null,
        });
        addLog("system", "Preview agent state reset.");
        return { ok: true };
      },
      send: async () => ({ ok: false }),
      getStatus: async () => agentState,
      onStatus: (callback) => {
        statusSubscribers.add(callback);
        return () => statusSubscribers.delete(callback);
      },
    },
    mcp: {
      callTool: async () => ({ ok: false, error: previewUnavailableMessage }),
    },
    file: {
      open: async () => ({ ok: false, error: previewUnavailableMessage }),
      openInEditor: async () => ({ ok: false, error: previewUnavailableMessage }),
    },
    logs: {
      get: async () => logs,
      clear: async () => {
        logs.length = 0;
        return { ok: true };
      },
      onEntry: (callback) => {
        logSubscribers.add(callback);
        return () => logSubscribers.delete(callback);
      },
    },
    errors: {
      get: async () => errors,
      onEntry: (callback) => {
        errorSubscribers.add(callback);
        return () => errorSubscribers.delete(callback);
      },
    },
    stacks: {
      get: async () => stacks,
      clear: async () => {
        stacks = [];
        for (const subscriber of stackSubscribers) subscriber(stacks);
        return { ok: true };
      },
      onUpdate: (callback) => {
        stackSubscribers.add(callback);
        return () => stackSubscribers.delete(callback);
      },
    },
    drive: {
      get: async () => [],
    },
    cdp: {
      getScreenshots: async () => screenshots,
      addScreenshot: async (screenshot) => {
        const item = { ...screenshot, id: makeId("cdp"), timestamp: Date.now() };
        screenshots.unshift(item);
        for (const subscriber of screenshotSubscribers) subscriber(item);
        return item;
      },
      onNewScreenshot: (callback) => {
        screenshotSubscribers.add(callback);
        return () => screenshotSubscribers.delete(callback);
      },
    },
    research: {
      get: async () => researchBriefs,
      add: async (brief) => {
        const item = { ...brief, id: makeId("research"), timestamp: Date.now() };
        researchBriefs = [item, ...researchBriefs];
        for (const subscriber of researchSubscribers) subscriber(researchBriefs);
        return item;
      },
      onUpdate: (callback) => {
        researchSubscribers.add(callback);
        return () => researchSubscribers.delete(callback);
      },
    },
    corrections: {
      get: async () => corrections,
      add: async (correction) => {
        const item = { ...correction, id: makeId("correction"), timestamp: Date.now() };
        corrections = [item, ...corrections];
        for (const subscriber of correctionSubscribers) subscriber(corrections);
        return item;
      },
      apply: async (id) => {
        const item = corrections.find((correction) => correction.id === id);
        if (!item) return { ok: false, error: `Correction not found: ${id}` };
        corrections = corrections.filter((correction) => correction.id !== id);
        for (const subscriber of correctionSubscribers) subscriber(corrections);
        return { ok: true, applied: item };
      },
      onUpdate: (callback) => {
        correctionSubscribers.add(callback);
        return () => correctionSubscribers.delete(callback);
      },
    },
  };

  window.quantumAPI = api;
}

installBrowserPreviewApi();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
