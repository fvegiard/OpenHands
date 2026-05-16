---
name: skill-new
description: Meta-skill. Draft a new SKILL.md from a natural-language description, generate fixtures, run `quantum verify`, then open a PR adding the skill.
allowed-tools: [Bash, Edit, Read, Write, mcp__quantum__remember]
---

Given a description:
1. Draft `skills-core/<name>/SKILL.md` with YAML frontmatter and an
   imperative body.
2. Generate at least one fixture (an example invocation).
3. Run `mise run green`.
4. If green, open a PR titled `feat(skills): <name>`. Otherwise iterate.
