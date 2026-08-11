import { useCallback, useState } from "react";
import AgentStatus from "./components/AgentStatus";
import CdpScreenshots from "./components/CdpScreenshots";
import CorrectionProposals from "./components/CorrectionProposals";
import DriveMap from "./components/DriveMap";
import ErrorPanel from "./components/ErrorPanel";
import LogStream from "./components/LogStream";
import McpTools from "./components/McpTools";
import ResearchBriefs from "./components/ResearchBriefs";
import StackOverview from "./components/StackOverview";
import TabNav from "./components/TabNav";
import type { TabId } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("logs");
  const [prompt, setPrompt] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsStarting(true);
    try {
      await window.quantumAPI.agent.start(prompt.trim());
    } finally {
      setIsStarting(false);
    }
  }, [prompt]);

  const handleStop = useCallback(async () => {
    await window.quantumAPI.agent.stop();
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">⚛️ Quantum Agent</h1>
          <AgentStatus />
        </div>
        <div className="header-center">
          <input
            id="agent-prompt"
            name="agent-prompt"
            aria-label="Agent prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter prompt to start agent..."
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            disabled={isStarting}
            className="prompt-input"
          />
          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting || !prompt.trim()}
            className="primary"
          >
            {isStarting ? "Starting..." : "▶ Start"}
          </button>
          <button type="button" onClick={handleStop} className="danger">
            ■ Stop
          </button>
        </div>
        <div className="header-right">
          <span className="header-badge">Electron Dashboard</span>
        </div>
      </header>

      <TabNav active={activeTab} onChange={setActiveTab} />

      <main className="app-main">
        {activeTab === "logs" && <LogStream />}
        {activeTab === "errors" && <ErrorPanel />}
        {activeTab === "stacks" && <StackOverview />}
        {activeTab === "drive" && <DriveMap />}
        {activeTab === "cdp" && <CdpScreenshots />}
        {activeTab === "research" && <ResearchBriefs />}
        {activeTab === "corrections" && <CorrectionProposals />}
        {activeTab === "mcp" && <McpTools />}
      </main>
    </div>
  );
}
