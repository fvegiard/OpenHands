import { useState } from "react";

interface McpTool {
  name: string;
  description: string;
}

const MCP_TOOLS: McpTool[] = [
  { name: "quantum.run", description: "One-shot prompt" },
  { name: "quantum.run_quantum", description: "Full superpose→measure loop" },
  { name: "quantum.recall", description: "Search the entangled blackboard" },
  { name: "quantum.remember", description: "Persist a fact" },
  { name: "quantum.list_agents", description: "List specialist agents" },
  { name: "quantum.list_skills", description: "List installed skills" },
  { name: "bash", description: "Run a shell command" },
  { name: "fetch", description: "HTTP GET/POST a URL" },
  { name: "grep", description: "Recursive regex grep" },
  { name: "read", description: "Read a file (truncated to 64k)" },
];

export default function McpTools() {
  const [selected, setSelected] = useState<string>(MCP_TOOLS[0].name);
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleCall = async () => {
    setLoading(true);
    setResult("");
    try {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(args);
      } catch (parseErr) {
        setResult(
          `Invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
        setLoading(false);
        return;
      }
      const res = await window.quantumAPI.mcp.callTool(selected, parsedArgs);
      if (res.ok) {
        setResult(JSON.stringify(res.data, null, 2));
      } else {
        setResult(`Error: ${res.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>🔌 MCP Tools</h2>
      </div>
      <div className="mcp-layout">
        <div className="mcp-sidebar">
          {MCP_TOOLS.map((tool) => (
            <button
              key={tool.name}
              type="button"
              className={`mcp-tool-btn ${selected === tool.name ? "mcp-active" : ""}`}
              onClick={() => setSelected(tool.name)}
            >
              <span className="mcp-tool-name">{tool.name}</span>
              <span className="mcp-tool-desc">{tool.description}</span>
            </button>
          ))}
        </div>
        <div className="mcp-main">
          <div className="mcp-form">
            <label htmlFor="mcp-tool-select">
              Tool: <code>{selected}</code>
            </label>
            <label htmlFor="mcp-tool-args">Arguments (JSON):</label>
            <textarea
              id="mcp-tool-args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              rows={6}
            />
            <button type="button" onClick={handleCall} disabled={loading} className="primary">
              {loading ? "Calling..." : "Call Tool"}
            </button>
          </div>
          {result && (
            <div className="mcp-result">
              <label htmlFor="mcp-tool-result">Result:</label>
              <pre id="mcp-tool-result">{result}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
