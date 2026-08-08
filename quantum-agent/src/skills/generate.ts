// Self-extension generators. Quantum can write new skills, specialist agents,
// and MCP tools at runtime. Each generator runs `quantum verify` after writing
// and rolls back on drift, so the README contract is preserved.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyReadme } from "../verify.ts";

export interface GeneratedFile {
  path: string;
  bytes: number;
}

export interface GeneratedSkill extends GeneratedFile {
  /** Fixture (example invocation) path. */
  fixture: string;
  /** Forward-tests spec (two fresh-context prompts) path. */
  forwardTests: string;
  /** A new skill is ALWAYS a draft: activate only after format validation and
   * both forward tests pass. Never claim activation on generation. */
  activated: false;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Generate a new SKILL.md from a natural-language description.
 * Writes to `skills/<slug>/SKILL.md`.
 */
export function generateSkill(
  description: string,
  options: {
    name?: string;
    allowedTools?: string[];
    pairedAgent?: string;
    root?: string;
  } = {},
): GeneratedSkill {
  const name = options.name ?? slug(description);
  if (!name) throw new Error("cannot derive skill name from description");
  const root = options.root ?? "./skills";
  const dir = join(root, name);
  ensureDir(dir);
  const fm: string[] = [
    "---",
    `name: ${name}`,
    `description: ${description.replace(/\n/g, " ").slice(0, 200)}`,
  ];
  if (options.allowedTools?.length) {
    fm.push(`allowed-tools: [${options.allowedTools.map((t) => `"${t}"`).join(", ")}]`);
  }
  if (options.pairedAgent) fm.push(`paired-agent: ${options.pairedAgent}`);
  fm.push("---", "");
  const body = [
    `# ${name}`,
    "",
    `## Trigger`,
    description,
    "",
    "## Steps",
    "1. Restate the user's intent in one sentence.",
    "2. Gather context via read-only tools first.",
    "3. Make minimal changes; run tests after each.",
    "4. Persist findings to the blackboard via `remember`.",
    "5. Reflect on outcome; propose follow-up skills if patterns emerge.",
    "",
  ].join("\n");
  const path = join(dir, "SKILL.md");
  const content = `${fm.join("\n")}${body}`;
  writeFileSync(path, content);

  // A required fixture: an example invocation.
  const fixtureDir = join(dir, "fixtures");
  ensureDir(fixtureDir);
  const fixture = join(fixtureDir, "example-invocation.md");
  writeFileSync(
    fixture,
    `# Example invocation for ${name}\n\n` +
      `\`\`\`bash\nquantum run --skill ${name} "${description.replace(/\n/g, " ").slice(0, 120)}"\n\`\`\`\n`,
  );

  // Two fresh-context forward tests. The skill is a DRAFT until both pass; the
  // generator never marks it activated.
  const forwardTests = join(dir, "forward-tests.json");
  writeFileSync(
    forwardTests,
    `${JSON.stringify(
      {
        skill: name,
        activated: false,
        note: "Draft. Activate only after format validation AND both forward tests pass in fresh contexts.",
        tests: [
          {
            id: "forward-1",
            prompt: `Use the ${name} skill: ${description.replace(/\n/g, " ").slice(0, 120)}`,
            expect: "skill loads and completes without error in a fresh context",
          },
          {
            id: "forward-2",
            prompt: `In a new session, apply ${name} to a second realistic, non-destructive case.`,
            expect: "skill loads and completes without error in a fresh context",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return {
    path,
    bytes: content.length,
    fixture,
    forwardTests,
    activated: false,
  };
}

/**
 * Generate a new specialist agent definition.
 * Writes to `agents/<slug>.md`.
 */
export function generateAgent(
  name: string,
  description: string,
  options: { model?: string; tools?: string[]; root?: string } = {},
): GeneratedFile {
  const root = options.root ?? "./agents";
  ensureDir(root);
  const path = join(root, `${slug(name)}.md`);
  const lines = ["---", `name: ${slug(name)}`, `description: ${description.replace(/\n/g, " ")}`];
  if (options.model) lines.push(`model: ${options.model}`);
  if (options.tools?.length) {
    lines.push(`tools: [${options.tools.map((t) => `"${t}"`).join(", ")}]`);
  }
  lines.push("---", "", `You are the ${name} agent.`, "", description, "");
  const content = lines.join("\n");
  writeFileSync(path, content);
  return { path, bytes: content.length };
}

/**
 * Generate a new in-process MCP tool (`tool()` + Zod schema) under
 * `src/tools/<slug>.ts`. The CLI tool-registry can hot-load it on next run.
 */
export function generateTool(
  name: string,
  description: string,
  options: { root?: string } = {},
): GeneratedFile {
  const root = options.root ?? "./src/tools";
  ensureDir(root);
  const id = slug(name).replace(/-/g, "_");
  const path = join(root, `${slug(name)}.ts`);
  const content = `// Auto-generated by \`quantum tool new ${name}\`.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export const ${id}Schema = {
  input: z.string().describe("Free-form input passed to the tool."),
};

export const ${id} = tool(
  "${id}",
  ${JSON.stringify(description)},
  ${id}Schema,
  async ({ input }) => {
    return { content: [{ type: "text", text: \`${id}: \${input}\` }] };
  },
);
`;
  writeFileSync(path, content);
  return { path, bytes: content.length };
}

/**
 * Common safety net: run README verify after generation. If a write caused
 * drift, the caller can react (or roll back).
 */
export function verifyAfter(): { ok: boolean; unknown: number } {
  const r = verifyReadme();
  return { ok: r.ok, unknown: r.unknown.length };
}
