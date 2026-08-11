import React from "react";
import { useAgentStatus } from "../hooks/useAgentIPC";

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--text-muted)",
  running: "var(--accent-green)",
  error: "var(--accent-red)",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

export default function AgentStatus() {
  const state = useAgentStatus();

  return (
    <div className="agent-status">
      <span className="status-dot" style={{ background: STATUS_COLORS[state.status] }} />
      <span className="status-label">{STATUS_LABELS[state.status]}</span>
      {state.sessionId && <span className="status-session">Session: {state.sessionId.slice(0, 12)}...</span>}
      {state.error && <span className="status-error">{state.error}</span>}
    </div>
  );
}
