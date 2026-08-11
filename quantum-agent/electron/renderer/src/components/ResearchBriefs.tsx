import { useResearchBriefs } from "../hooks/useAgentIPC";

export default function ResearchBriefs() {
  const briefs = useResearchBriefs();

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString("en-US", { hour12: false });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔍 Research Briefs</h2>
        <span className="badge">{briefs.length} briefs</span>
      </div>
      <div className="research-list">
        {briefs.length === 0 && <div className="empty-state">No research briefs yet</div>}
        {briefs.map((brief) => (
          <div key={brief.id} className="research-card">
            <div className="research-header">
              <span className="research-query">Query: {brief.query}</span>
              <span className="research-time">[{formatTime(brief.timestamp)}]</span>
            </div>
            <div className="research-summary">{brief.summary}</div>
            {brief.sources.length > 0 && (
              <div className="research-sources">
                {brief.sources.map((s) => (
                  <div key={s.url} className="research-source">
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                    <p>{s.snippet}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
