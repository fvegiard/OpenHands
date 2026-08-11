import { useStacks } from "../hooks/useAgentIPC";

export default function StackOverview() {
  const { frames, clear } = useStacks();

  const grouped = frames.reduce<Record<string, typeof frames>>((acc, f) => {
    const key = f.file || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📚 Stack Overview</h2>
        <button onClick={clear} className="danger">Clear</button>
      </div>
      <div className="stack-overview">
        {frames.length === 0 && (
          <div className="empty-state">No stack frames captured</div>
        )}
        {Object.entries(grouped).map(([file, fileFrames]) => (
          <div key={file} className="stack-file">
            <div className="stack-file-header">{file}</div>
            {fileFrames.map((frame, i) => (
              <div key={i} className="stack-frame">
                <span className="stack-fn">{frame.function}</span>
                <span className="stack-loc">line {frame.line}:{frame.column}</span>
                {frame.context && <pre className="stack-ctx">{frame.context}</pre>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
