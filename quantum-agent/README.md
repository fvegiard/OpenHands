# Quantum Agent

> A personal coding agent on the official Claude Agent SDK, with provider-neutral
> runtimes, local + installable Git skills, and README/capability gates that fail
> on unbacked claims.

Quantum Agent is built on
[`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-typescript).
It authenticates to Claude via **OAuth (Pro/Max) or an API key**, and can also
drive other runtimes (OpenAI Agents SDK, OpenAI Codex SDK) via explicit,
provider-neutral profiles. What it does — and what it does **not** yet do — is
recorded in a machine-readable capability manifest and enforced by the README
gate below.

## Capabilities (source of truth)

The table is generated from [`capabilities.json`](./capabilities.json) and kept
in sync by `quantum verify`. `implemented` = backed by a passing test;
`experimental` = present but unbenchmarked; `not implemented` = intentionally
absent; external tools are **NOT BENCHMARKED** (no identical benchmark run).

<!-- CAPABILITY_MATRIX:START -->
_Generated from `capabilities.json` on 2026-08-09. External tools are NOT BENCHMARKED — no absolute "most advanced"/"surpass" claim is made without an identical benchmark._

| Capability | Status | Evidence / note |
|---|---|---|
| Claude OAuth (Pro/Max) / API auth | implemented | `test/auth.test.ts` |
| Parallel-hypothesis loop (superpose then measure) | implemented | `test/measure.test.ts` |
| Provider-neutral runtimes + typed profiles (claude / openai-agents / codex) | implemented | `test/provider-profiles.test.ts` |
| README-as-spec command verifier | implemented | `test/verify.test.ts` |
| Capability-manifest semantic gate | implemented | `test/capabilities.test.ts` |
| Local skills + installable Git sources (gh:owner/repo) | implemented | `test/skills.test.ts` |
| skill new writes a DRAFT (activate only after format + 2 fresh-context tests) | implemented | `test/generate.test.ts` |
| Canned workflows (issue-to-pr, pr-review-merge, bug-repro-fix, rfc-hyperplan) | implemented | `test/workflows.test.ts` |
| Post-task reflection to the local blackboard | implemented | `test/reflect.test.ts` |
| Unattended permission gating | implemented | `test/permissions.test.ts` |
| Local LLM / HTTP response cache (sqlite) | implemented | `test/cache.test.ts` |
| MCP-style HTTP/SSE endpoints (quantum serve --mcp) | experimental | HTTP endpoints exist (Hono); not a full MCP stdio server; unbenchmarked |
| MCP client (sequential-thinking via the Claude SDK) | experimental | wired in the Claude adapter; unbenchmarked |
| Image input (quantum see) | experimental | thin wrapper over the model's vision; unbenchmarked |
| Voice in/out (quantum listen / --speak) | experimental | file transcription/TTS wrappers; the live loop is not implemented |
| Best-effort pre-code web search | experimental | network best-effort; disabled in mock/no-auth runs |
| Remote skill aggregation / large ecosystem counts | not implemented | no remote index; local + Git sources only |
| NVIDIA GPU dev environment | not implemented | — |
| Mobile integration | not implemented | — |
| Automatic dependency / skill-index updates | not implemented | — |
| Auto-drafting new skills from reflection | not implemented | — |
| Auto green + self-heal after every commit | not implemented | — |
| OpenHands (external) | NOT BENCHMARKED | no identical benchmark run |
| Sisyphus (external) | NOT BENCHMARKED | no identical benchmark run |
| OpenClaw (external) | NOT BENCHMARKED | no identical benchmark run |
<!-- CAPABILITY_MATRIX:END -->

## Install

```bash
pnpm install                    # Node >= 22.13
cp .env.example .env            # add CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) or ANTHROPIC_API_KEY
pnpm link --global              # provides the `quantum` CLI
```

## Quickstart

```bash
quantum doctor                  # check auth, tools, agents, skills
quantum init                    # pull default local skill packs
quantum run "summarise this repo in 5 bullets"
quantum chat                    # multi-turn (resume with --resume last)
quantum run --quantum "design a refactor of X"   # superpose then measure
quantum run --skill hyperplan "ship feature Y"   # hostile-critic review
quantum tui                     # live dashboard of parallel branches
```

## Providers / runtimes

Quantum's default runtime is Claude via `@anthropic-ai/claude-agent-sdk`. That
SDK runs **Claude models only** (through Anthropic, Bedrock, Vertex, or
Foundry) — setting an OpenAI/Gemini key does not make that runtime use those
models. To run non-Claude models, select a different runtime built on its own
official SDK. Optional runtimes are discoverable, not bundled: if the package or
secret is missing, Quantum prints the exact package/secret needed and exits — no
silent fallback.

```bash
quantum provider list                 # runtimes + required package/secret
quantum provider status               # selected runtime, model, base-url, secret NAME, capabilities
quantum provider select openai-agents --model gpt-5.1
quantum provider test                 # contract test (no call)
quantum provider test --live          # opt-in: minimal real call; NOT VERIFIED if not executed
```

### Typed provider profiles (easy provider/API-key switching)

`provider select` persists a **typed profile** — NAMES/config only, never a key
value. Flags: `--provider <name>`, `--model <id>`, `--base-url <url>`,
`--secret-env <ENV_NAME>` (NAME of the env var holding the key),
`--provider-package <pkg>` (Vercel AI SDK provider package), and
`--resume-thread-id <id>` (Codex thread to resume):

```bash
quantum provider select openai-agents --provider openai --model gpt-5.1 --secret-env OPENAI_API_KEY
```

`--secret-env` is validated as an env var **NAME** (`[A-Za-z_][A-Za-z0-9_]*`); a
value is rejected. The selected adapter resolves **exactly** `env[secretEnv]`,
injects it only into that SDK, and fails explicitly if it is absent — no fallback
and no global env mutation. When `--secret-env` is omitted the defaults apply
(`OPENAI_API_KEY` / `CODEX_API_KEY` / Anthropic names).

Example — MiniMax via the official Vercel AI SDK provider
([`vercel-minimax-ai-provider`](https://github.com/MiniMax-AI/vercel-minimax-ai-provider),
factory export `minimax` / `minimaxOpenAI`):

```bash
quantum provider select openai-agents --provider minimax --model MiniMax-M3 --provider-package vercel-minimax-ai-provider --secret-env MINIMAX_API_KEY
```

> The provider package officially lists MiniMax‑M2 / M2‑Stable. `MiniMax-M3` is
> accepted as a configurable model; a **live M3 call is NOT VERIFIED** here until
> the provider/model officially ships it — Quantum never fabricates support.

Selection precedence (env overrides a persisted profile, which overrides the
`claude` default): `QUANTUM_RUNTIME` / `QUANTUM_PROVIDER` / `QUANTUM_MODEL` /
`QUANTUM_BASE_URL` / `QUANTUM_SECRET_ENV` / `QUANTUM_PROVIDER_PACKAGE`
(`QUANTUM_AISDK_PACKAGE` kept for back-compat) / `QUANTUM_RESUME_THREAD_ID`.
Secret **values** come only from environment variables / Cursor Secrets; Quantum
never stores or prints a key (`runtime.json` holds the NAME only).

## Skills (local + installable Git sources)

Quantum discovers skills from local directories (`./skills`, `./skills-core`) and
can install more from Git. There is **no remote aggregation index and no
ecosystem count** — only what is local plus what you install.

```bash
quantum skill list
quantum skill search "react accessibility"
quantum skill install gh:owner/repo                  # clone a Git skill repo
quantum skill install --pack default                 # packs resolved via skills.sources.toml
quantum skill translate hyperplan --to openclaw
quantum skill new "summarise PRs nightly to slack"   # writes a DRAFT (see below)
quantum skill sync                                   # expose skills-core via .agents/skills
```

Install honesty:
- A **failed clone** (unavailable / private / bad repo) is a **precise, nonzero
  failure**; any partial directory is removed. It is never reported as installed.
- An **offline install** (`QUANTUM_SKILLS_OFFLINE=1`) writes a **NOT_VERIFIED
  placeholder** under `.drafts/` that is never discovered or activated — it is
  reported under `placeholders`, never `installed`.

## skill new is a DRAFT

`quantum skill new` writes `SKILL.md` + a fixture + a two-case forward-test spec
and marks the skill **DRAFT (not activated)**. Activation happens only after
format validation AND both fresh-context forward tests pass; activation failure
is explicit.

## Experimental

Present but unbenchmarked (see the matrix). Treat as best-effort, not guarantees:

```bash
quantum serve --mcp --port 8765       # local HTTP/SSE endpoints (not a full MCP stdio server)
quantum see screenshot.png "what's broken in this UI"
quantum run --speak "explain transformers"
```

## Verify (README + capability gate)

`quantum verify` (1) parses every fenced bash block and checks each command head
is a known `quantum` subcommand or a well-known external, and (2) runs the
capability gate against [`capabilities.json`](./capabilities.json): it **fails**
on matrix drift, an `implemented` claim with missing evidence, a fabricated
count, or an unbacked marketing claim in the prose.

```bash
quantum verify
```

## Hard rules

1. **README is the spec, capabilities are the proof.** Every `implemented` claim
   points to a passing test; the gate fails otherwise.
2. **No unbenchmarked superiority.** External tools are NOT BENCHMARKED; no
   absolute ranking claim without an identical benchmark run.
3. **No fake success.** A failed skill install is a precise failure; an offline
   placeholder is never counted as installed.
4. **Secrets by NAME only.** Quantum never stores or prints a key value.

## License

MIT — see [LICENSE](./LICENSE).
