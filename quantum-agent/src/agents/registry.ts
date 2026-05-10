// Dynamic agent roster. Always present: 6 core orchestrators. Skill-paired
// agents are auto-derived from any installed SKILL.md that declares
// `paired-agent:`. User agents from agents/.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { listInstalled } from "../skills/manager.ts";

export interface AgentDef {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  source: "core" | "user" | "skill";
}

export const CORE_AGENTS: AgentDef[] = [
  {
    name: "orchestrator",
    description: "Plans, routes, runs the quantum loop",
    prompt: "You are the orchestrator. Decompose, delegate, measure.",
    source: "core",
  },
  {
    name: "explorer",
    description: "Read-only repo scout",
    prompt: "Explore the codebase. Never edit. Return findings.",
    source: "core",
  },
  {
    name: "coder",
    description: "Implementation",
    prompt: "Implement the requested change. Tests must pass.",
    source: "core",
  },
  {
    name: "reviewer",
    description: "Diff critic",
    prompt: "Review the diff for correctness, security, perf, style.",
    source: "core",
  },
  {
    name: "intent-router",
    description: "Classifies user intent before routing",
    prompt: "Classify the user's intent in one word.",
    source: "core",
  },
  {
    name: "hyperplan-critic",
    description: "One of 5 hostile critics",
    prompt: "Be hostile. Find every flaw in the proposed plan.",
    source: "core",
  },
];

function loadUserAgents(): AgentDef[] {
  const dir = "./agents";
  if (!existsSync(dir)) return [];
  const out: AgentDef[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isFile() || !name.endsWith(".md")) continue;
    const raw = readFileSync(path, "utf8");
    const desc =
      raw
        .split("\n")
        .find((l) => l.startsWith("description:"))
        ?.replace(/^description:\s*/, "") ?? "";
    out.push({ name: name.replace(/\.md$/, ""), description: desc, prompt: raw, source: "user" });
  }
  return out;
}

function loadSkillPairedAgents(): AgentDef[] {
  const out: AgentDef[] = [];
  for (const m of listInstalled()) {
    const paired = m.frontmatter["paired-agent"];
    if (!paired) continue;
    out.push({
      name: typeof paired === "string" ? paired : m.frontmatter.name,
      description: `Paired with skill: ${m.frontmatter.name}`,
      prompt: m.frontmatter.description ?? "",
      model: m.frontmatter.model,
      source: "skill",
    });
  }
  return out;
}

export function listAgents(): AgentDef[] {
  return [...CORE_AGENTS, ...loadUserAgents(), ...loadSkillPairedAgents()];
}
