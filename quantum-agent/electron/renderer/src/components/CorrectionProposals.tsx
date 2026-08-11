import { useCorrections } from "../hooks/useAgentIPC";

const TYPE_COLORS: Record<string, string> = {
  node: "var(--accent-green)",
  python: "var(--accent-blue)",
  path: "var(--accent-orange)",
  shell: "var(--accent-purple)",
  llm: "var(--accent-cyan)",
};

export default function CorrectionProposals() {
  const { items, apply, dismiss } = useCorrections();

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔧 Correction Proposals</h2>
        <span className="badge">{items.length} pending</span>
      </div>
      <div className="corrections-list">
        {items.length === 0 && <div className="empty-state">No corrections proposed</div>}
        {items.map((c) => (
          <div key={c.id} className="correction-card">
            <div className="correction-header">
              <span className="correction-type" style={{ color: TYPE_COLORS[c.type] }}>
                [{c.type.toUpperCase()}]
              </span>
              <span className="correction-confidence">
                {(c.confidence * 100).toFixed(0)}% confidence
              </span>
              <span className="correction-time">[{formatTime(c.timestamp)}]</span>
            </div>
            <div className="correction-message">{c.message}</div>
            {c.patch && <pre className="correction-patch">{c.patch}</pre>}
            <div className="correction-actions">
              <button type="button" onClick={() => apply(c.id)} className="success">
                Apply Fix
              </button>
              <button type="button" onClick={() => dismiss(c.id)} className="danger">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
