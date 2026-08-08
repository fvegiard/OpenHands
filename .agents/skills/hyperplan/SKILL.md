---
name: hyperplan
description: Stress-test an implementation plan with 5 hostile critics in parallel before any code is written. Trigger when the user has a plan, design, or RFC.
allowed-tools: [Read, Grep, Glob, WebFetch, mcp__quantum__remember, mcp__quantum__recall]
paired-agent: hyperplan-critic
---

> Generated from `quantum-agent/skills-core/hyperplan/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


Run five critic subagents in parallel: pessimist, security, perf,
maintainability, scope. Each writes findings to the blackboard. Aggregate
into a single ranked risk list. Stop when no critic has new findings.
