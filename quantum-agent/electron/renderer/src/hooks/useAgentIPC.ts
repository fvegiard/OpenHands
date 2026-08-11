import { useState, useEffect, useCallback, useRef } from "react";
import type { LogEntry, ErrorEntry, StackFrame, AgentState, CdpScreenshot, ResearchBrief, CorrectionProposal } from "../preload.ts";

export function useAgentStatus() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    sessionId: null,
    prompt: null,
    startedAt: null,
    error: null,
  });

  useEffect(() => {
    const unsub = window.quantumAPI.agent.onStatus(setState);
    window.quantumAPI.agent.getStatus().then(setState);
    return unsub;
  }, []);

  return state;
}

export function useLogs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    const unsub = window.quantumAPI.logs.onEntry((entry) => {
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > 5000 ? next.slice(-5000) : next;
      });
    });
    window.quantumAPI.logs.get().then(setEntries);
    return unsub;
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    window.quantumAPI.logs.clear();
  }, []);

  return { entries, clear, autoScrollRef };
}

export function useErrors() {
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  useEffect(() => {
    const unsub = window.quantumAPI.errors.onEntry((entry) => {
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
    window.quantumAPI.errors.get().then(setEntries);
    return unsub;
  }, []);

  return entries;
}

export function useStacks() {
  const [frames, setFrames] = useState<StackFrame[]>([]);

  useEffect(() => {
    const unsub = window.quantumAPI.stacks.onUpdate(setFrames);
    window.quantumAPI.stacks.get().then(setFrames);
    return unsub;
  }, []);

  const clear = useCallback(() => {
    setFrames([]);
    window.quantumAPI.stacks.clear();
  }, []);

  return { frames, clear };
}

export function useDrive() {
  const [nodes, setNodes] = useState<DriveNode[]>([]);

  const refresh = useCallback(async () => {
    const data = await window.quantumAPI.drive.get();
    setNodes(data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { nodes, refresh };
}

export function useCdpScreenshots() {
  const [items, setItems] = useState<CdpScreenshot[]>([]);

  useEffect(() => {
    const unsub = window.quantumAPI.cdp.onNewScreenshot((s) => {
      setItems((prev) => [s, ...prev].slice(0, 100));
    });
    window.quantumAPI.cdp.getScreenshots().then(setItems);
    return unsub;
  }, []);

  return items;
}

export function useResearchBriefs() {
  const [briefs, setBriefs] = useState<ResearchBrief[]>([]);

  useEffect(() => {
    const unsub = window.quantumAPI.research.onUpdate(setBriefs);
    window.quantumAPI.research.get().then(setBriefs);
    return unsub;
  }, []);

  return briefs;
}

export function useCorrections() {
  const [items, setItems] = useState<CorrectionProposal[]>([]);

  useEffect(() => {
    const unsub = window.quantumAPI.corrections.onUpdate(setItems);
    window.quantumAPI.corrections.get().then(setItems);
    return unsub;
  }, []);

  const apply = useCallback(async (id: string) => {
    const result = await window.quantumAPI.corrections.apply(id);
    if (!result.ok) console.error("apply failed:", result.error);
    return result;
  }, []);

  const dismiss = useCallback(async (id: string) => {
    const result = await window.quantumAPI.corrections.dismiss(id);
    if (!result.ok) console.error("dismiss failed:", result.error);
    return result;
  }, []);

  return { items, apply, dismiss };
}
