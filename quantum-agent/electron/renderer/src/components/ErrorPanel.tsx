import React from "react";
import { useErrors } from "../hooks/useAgentIPC";

export default function ErrorPanel() {
  const entries = useErrors();

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", { hour12: false });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🚨 Error Panel</h2>
        <span className="badge">{entries.length} errors</span>
      </div>
      <div className="error-list">
        {entries.length === 0 && (
          <div className="empty-state">No errors detected</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="error-card">
            <div className="error-header">
              <span className="error-time">[{formatTime(entry.timestamp)}]</span>
              <span className="error-source">{entry.source || "agent"}</span>
            </div>
            <div className="error-message">{entry.message}</div>
            {entry.stack && (
              <pre className="error-stack">{entry.stack}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
