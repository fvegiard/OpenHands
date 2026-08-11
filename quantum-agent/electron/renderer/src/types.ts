import type {
  AgentState,
  LogEntry,
  ErrorEntry,
  StackFrame,
  DriveNode,
  CdpScreenshot,
  ResearchBrief,
  CorrectionProposal,
} from "../preload.ts";

export type {
  AgentState,
  LogEntry,
  ErrorEntry,
  StackFrame,
  DriveNode,
  CdpScreenshot,
  ResearchBrief,
  CorrectionProposal,
};

export type TabId = "logs" | "errors" | "stacks" | "drive" | "cdp" | "research" | "corrections" | "mcp";

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

export const TABS: TabDef[] = [
  { id: "logs", label: "Logs", icon: "📋" },
  { id: "errors", label: "Errors", icon: "🚨" },
  { id: "stacks", label: "Stacks", icon: "📚" },
  { id: "drive", label: "Drive", icon: "🗂️" },
  { id: "cdp", label: "CDP", icon: "📸" },
  { id: "research", label: "Research", icon: "🔍" },
  { id: "corrections", label: "Fixes", icon: "🔧" },
  { id: "mcp", label: "MCP", icon: "🔌" },
];
