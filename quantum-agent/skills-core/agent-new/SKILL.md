---
name: agent-new
description: Meta-skill. Draft a new specialist agent from a natural-language description and validate it with a smoke prompt.
allowed-tools: [Bash, Edit, Read, Write]
---

Given a description:
1. Draft `agents/<name>.md` with frontmatter (name, description, model,
   allowed-tools) and a short imperative body.
2. Run a smoke prompt that exercises the new agent.
3. Confirm it appears in `quantum agent list`.
