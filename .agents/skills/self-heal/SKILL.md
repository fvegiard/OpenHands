---
name: self-heal
description: After a failing build, diagnose and retry with a different strategy. Trigger when `mise run green` exits non-zero.
allowed-tools: [Bash, Edit, Read, mcp__quantum__remember]
---

> Generated from `quantum-agent/skills-core/self-heal/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


1. Capture the failing command and last 1000 chars of stderr.
2. Persist them as facts (`selfheal-failure-*`).
3. Choose a different strategy than any prior failure for this task:
   different agent, different model, smaller scope, contrarian.
4. Retry. Repeat until green or the step is stubbed with a TODO.
