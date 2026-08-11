import { useState } from "react";
import { useCdpScreenshots } from "../hooks/useAgentIPC";

export default function CdpScreenshots() {
  const items = useCdpScreenshots();
  const [selected, setSelected] = useState<string | null>(null);
  const current = items.find((s) => s.id === selected) || items[0];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📸 CDP Screenshots</h2>
        <span className="badge">{items.length} screenshots</span>
      </div>
      <div className="cdp-layout">
        <div className="cdp-list">
          {items.length === 0 && <div className="empty-state">No screenshots yet</div>}
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`cdp-thumb ${selected === s.id ? "cdp-selected" : ""}`}
              onClick={() => setSelected(s.id)}
            >
              <img src={s.dataUrl} alt={s.title || "screenshot"} />
              <span className="cdp-thumb-title">{s.title || s.url || `#${s.id.slice(0, 8)}`}</span>
            </button>
          ))}
        </div>
        <div className="cdp-viewer">
          {current ? (
            <>
              <img src={current.dataUrl} alt={current.title || "screenshot"} className="cdp-full" />
              <div className="cdp-meta">
                <span>{current.title || "Untitled"}</span>
                <span>{new Date(current.timestamp).toLocaleString()}</span>
                {current.url && <span>{current.url}</span>}
              </div>
            </>
          ) : (
            <div className="empty-state">Select a screenshot to preview</div>
          )}
        </div>
      </div>
    </div>
  );
}
