---
name: skill-new
description: Meta-skill. Draft a new SKILL.md plus fixtures and two fresh-context forward tests. Activate ONLY after format validation and both forward tests pass; otherwise it stays a draft. Never claim activation prematurely.
allowed-tools: [Bash, Edit, Read, Write, mcp__quantum__remember]
---

> Generated from `quantum-agent/skills-core/skill-new/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


Given a description, produce a **draft** (never claim activation up front):

1. Draft `skills-core/<name>/SKILL.md` (lowercase-hyphenated name, concise
   triggering metadata, imperative body). No placeholders/TODOs in required steps.
2. Generate at least one **fixture** (an example invocation) under
   `skills-core/<name>/fixtures/`.
3. Write **two** realistic, non-destructive **forward tests** (distinct prompts)
   under `skills-core/<name>/forward-tests.json` that exercise the skill in fresh
   contexts.
4. Validate format (frontmatter + name) and run `mise run green`.
5. Run BOTH forward tests in fresh contexts. **Activate the skill only if format
   validation AND both forward tests pass.** If either fails, the candidate
   remains a **draft** and the failure is reported (NOT VERIFIED) with evidence.
6. Only after activation, open a PR titled `feat(skills): <name>`.
