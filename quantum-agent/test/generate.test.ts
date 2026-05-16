import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateAgent, generateSkill, generateTool } from "../src/skills/generate.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "quantum-gen-"));
}

describe("self-extension generators", () => {
  it("generateSkill writes a SKILL.md with name+description", () => {
    const root = tmp();
    const f = generateSkill("Refactor a long function into smaller pieces", { root });
    const txt = readFileSync(f.path, "utf8");
    expect(txt).toContain("name: refactor-a-long-function-into-smaller-pieces");
    expect(txt).toContain("description: Refactor a long function into smaller pieces");
    expect(txt).toContain("## Steps");
    rmSync(root, { recursive: true, force: true });
  });

  it("generateSkill honours custom name + allowed-tools", () => {
    const root = tmp();
    const f = generateSkill("Custom", {
      name: "my-skill",
      allowedTools: ["Read", "Grep"],
      root,
    });
    const txt = readFileSync(f.path, "utf8");
    expect(txt).toContain("name: my-skill");
    expect(txt).toContain('allowed-tools: ["Read", "Grep"]');
    rmSync(root, { recursive: true, force: true });
  });

  it("generateAgent writes agents/<slug>.md", () => {
    const root = tmp();
    const f = generateAgent("perf-bot", "Profile and optimise hot code paths", {
      root,
      model: "claude-opus-4-7",
      tools: ["Bash"],
    });
    const txt = readFileSync(f.path, "utf8");
    expect(f.path).toMatch(/perf-bot\.md$/);
    expect(txt).toContain("name: perf-bot");
    expect(txt).toContain("model: claude-opus-4-7");
    expect(txt).toContain('tools: ["Bash"]');
    rmSync(root, { recursive: true, force: true });
  });

  it("generateTool writes a tool() definition with Zod schema", () => {
    const root = tmp();
    const f = generateTool("ping-host", "Ping a host and return latency", { root });
    const txt = readFileSync(f.path, "utf8");
    expect(f.path).toMatch(/ping-host\.ts$/);
    expect(txt).toContain('import { tool } from "@anthropic-ai/claude-agent-sdk"');
    expect(txt).toContain('import { z } from "zod"');
    expect(txt).toContain('"ping_host"');
    expect(txt).toContain("ping_host_schema".replace("_schema", "Schema"));
    rmSync(root, { recursive: true, force: true });
  });
});
