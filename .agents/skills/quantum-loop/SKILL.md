---
name: quantum-loop
description: Run the prepare → superpose → entangle → interfere → measure → amplify pipeline. Trigger when the task has more than one credible approach.
allowed-tools: [mcp__quantum__remember, mcp__quantum__recall]
---

> Generated from `quantum-agent/skills-core/quantum-loop/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


Spawn 3 candidate plans in parallel; each runs in its own session and
writes its conclusion to the entangled blackboard. Score via Jaccard
agreement plus any explicit `score` writes. Collapse to the highest-scoring
plan and commit it. If the same plan wins twice in a row, inject a
contrarian and re-measure.
