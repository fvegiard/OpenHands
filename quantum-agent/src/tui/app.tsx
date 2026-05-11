// Live TUI dashboard — Ink + React. Shows installed agents/skills and
// live blackboard activity. Read-only view; interactive run via CLI.

import { Box, render, Text } from "ink";
import type React from "react";
import { listAgents } from "../agents/registry.ts";
import { db } from "../memory.ts";
import { listInstalled } from "../skills/manager.ts";

interface Row {
  task: string;
  branch: string;
  kind: string;
  ts: number;
}

function recentFindings(limit = 10): Row[] {
  try {
    return db()
      .prepare("SELECT task, branch, kind, ts FROM bb_findings ORDER BY ts DESC LIMIT ?")
      .all(limit) as unknown as Row[];
  } catch {
    return [];
  }
}

function Dashboard(): React.ReactElement {
  const agents = listAgents();
  const skills = listInstalled();
  const findings = recentFindings();
  return (
    <Box flexDirection="column">
      <Text color="cyan">Quantum Agent — live dashboard</Text>
      <Text>
        agents={agents.length} skills={skills.length} findings={findings.length}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Recent blackboard activity</Text>
        {findings.length === 0 ? (
          <Text dimColor>(no findings yet — run `quantum run --quantum ...`)</Text>
        ) : (
          findings.map((f) => (
            <Text key={`${f.task}-${f.branch}-${f.ts}`}>
              {new Date(f.ts).toISOString()} [{f.branch}] {f.kind} {f.task.slice(0, 40)}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

export function startTui(): void {
  render(<Dashboard />);
}
