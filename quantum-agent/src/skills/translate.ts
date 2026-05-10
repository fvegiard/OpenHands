// Skill format translator. Converts between Claude SKILL.md and other agent
// formats. Single canonical IR (the parsed manifest) makes adding new
// targets cheap.

import { loadBody, type SkillManifest } from "./loader.ts";

export type TargetFormat = "claude" | "openclaw" | "cursor" | "codex" | "gemini";

export function translate(manifest: SkillManifest, to: TargetFormat): string {
  const { body } = loadBody(manifest);
  const fm = manifest.frontmatter;
  switch (to) {
    case "claude":
      return `---\nname: ${fm.name}\ndescription: ${fm.description}\n---\n${body}`;
    case "openclaw":
      return JSON.stringify(
        { name: fm.name, description: fm.description, instructions: body },
        null,
        2,
      );
    case "cursor":
      return `# ${fm.name}\n\n> ${fm.description}\n\n${body}`;
    case "codex":
      return `# Codex skill: ${fm.name}\n\n${fm.description}\n\n---\n\n${body}`;
    case "gemini":
      return `## ${fm.name}\n\n_${fm.description}_\n\n${body}`;
  }
}
