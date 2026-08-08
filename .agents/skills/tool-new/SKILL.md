---
name: tool-new
description: Meta-skill. Generate a new in-process MCP `tool()` (Zod schema + handler + unit test) and hot-load it into the Quantum MCP server.
allowed-tools: [Bash, Edit, Read, Write]
---

> Generated from `quantum-agent/skills-core/tool-new/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


Given a description and an input schema:
1. Add `src/tools/<name>.ts` with a Zod schema and async handler.
2. Register it in `src/tools/index.ts`.
3. Add a vitest test in `test/tools.test.ts`.
4. Run `mise run green`.
