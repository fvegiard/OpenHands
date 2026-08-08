---
name: readme-verify
description: README is the spec. Run `quantum verify` to confirm every fenced bash block in README.md still resolves to a known subcommand.
allowed-tools: [Bash, Read]
---

> Generated from `quantum-agent/skills-core/readme-verify/SKILL.md` by `quantum skill sync`. Edit the source, not this copy.


Parse README.md, extract fenced bash blocks, validate that every command
head is either `quantum <known-subcommand>` or one of the well-known
external tools (mise, pnpm, docker, git, claude, curl). Exit non-zero on
drift; fix the README or the implementation.
