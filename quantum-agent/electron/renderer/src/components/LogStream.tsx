import { useCallback, useRef } from "react";
import { useLogs } from "../hooks/useAgentIPC";

const LEVEL_COLORS: Record<string, string> = {
  stdout: "var(--text-primary)",
  stderr: "var(--accent-orange)",
  system: "var(--accent-cyan)",
};

export default function LogStream() {
  const { entries, clear } = useLogs();
  const bottomRef = useRef<HTMLDivElement>(null);

  const setBottomRef = useCallback((node: HTMLDivElement | null) => {
    bottomRef.current = node;
    node?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📋 Real-time Logs</h2>
        <button type="button" onClick={clear} className="danger">
          Clear
        </button>
      </div>
      <div className="log-stream">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="log-line"
            style={{ color: LEVEL_COLORS[entry.level] || "inherit" }}
          >
            <span className="log-time">[{formatTime(entry.timestamp)}]</span>
            <span className="log-level">[{entry.level.toUpperCase()}]</span>
            <span className="log-text">{escapeHtml(entry.text)}</span>
          </div>
        ))}
        <div ref={setBottomRef} />
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
