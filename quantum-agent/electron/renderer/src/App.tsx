import { useState, useCallback } from "react";
import AgentStatus from "./components/AgentStatus";
import TabNav from "./components/TabNav";
import LogStream from "./components/LogStream";
import ErrorPanel from "./components/ErrorPanel";
import StackOverview from "./components/StackOverview";
import DriveMap from "./components/DriveMap";
import CdpScreenshots from "./components/CdpScreenshots";
import ResearchBriefs from "./components/ResearchBriefs";
import CorrectionProposals from "./components/CorrectionProposals";
import McpTools from "./components/McpTools";
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
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter prompt to start agent..."
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            disabled={isStarting}
            className="prompt-input"
          />
          <button onClick={handleStart} disabled={isStarting || !prompt.trim()} className="primary">
            {isStarting ? "Starting..." : "▶ Start"}
          </button>
          <button onClick={handleStop} className="danger">
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
