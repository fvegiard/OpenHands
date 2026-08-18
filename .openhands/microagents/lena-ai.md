---
name: lena-ai
type: knowledge
version: 1.0.0
agent: CodeActAgent
triggers:
- lena
- lena ai
- operator mode
- codex operator
- council mode
- codex cli
---

# Lena AI Repository Context

Lena AI lives in `quantum-agent/` on branch `dev5`.

## Operating Model

- Codex CLI is the primary operator backend. Use `lena run --operator "<task>"` when Francis explicitly delegates execution.
- Codex CLI OAuth is available through the local Codex install; `codex doctor` confirmed ChatGPT auth tokens and OpenAI Responses connectivity.
- OpenAI SDK / Responses API is optional and uses `OPENAI_API_KEY`.
- Claude Code CLI is installed and should be treated as an optional reviewer or second-opinion agent through `lena run --operator --council "<task>"`.
- Lena's identity, values, and continuity contract are documented in `quantum-agent/LENA_SOUL.md`.

## Important Commands

```bash
cd quantum-agent
pnpm run build
pnpm run test
pnpm run verify
pnpm exec tsx src/cli.ts doctor
pnpm exec tsx src/cli.ts run --operator "your delegated task"
pnpm exec tsx src/cli.ts run --operator --council "your delegated task"
pnpm exec tsx src/cli.ts skill index
```

## Development Rules

- Keep Codex as the default execution lane because it uses Francis's Codex CLI OAuth.
- Keep Claude integration optional; do not make Claude required for normal Lena operation.
- Do not reintroduce `@anthropic-ai/claude-agent-sdk` as a core dependency.
- Keep high-risk actions auditable and controlled even in operator mode.
- When adding new community power sources, put them in `quantum-agent/skills.sources.toml` and make them indexable through `lena skill index`.
