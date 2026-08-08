# Quantum Agent

> The most advanced personal AI agent. TypeScript. OAuth-native. Quantum loop.
> 400 000+ skill aggregation. Self-extending. NVIDIA GPU dev env. MCP server
> + MCP client. Multi-modal. One-shot delivery.

Quantum Agent is a personal coding agent built on the official
[`@anthropic-ai/claude-agent-sdk`](https://github.com/anthropics/claude-agent-sdk-typescript).
It logs into your **Claude Pro/Max plan via OAuth** (no API bill) and pushes
the SDK far past stock Claude Code with a quantum-style multi-hypothesis
loop, a 400 000-skill ecosystem, dynamic specialist agents, multi-modal
input, and an auto-everything operating mode.

## Why Quantum

| Capability | OpenHands | Sisyphus | OpenClaw | **Quantum** |
|---|---|---|---|---|
| Native OAuth on Pro/Max | ❌ | ⚠ | ⚠ | ✅ |
| Parallel hypotheses + interference | ❌ | ✅ | ❌ | ✅ + amplification |
| Skill ecosystem | minimal | curated | 13 729 | **400 000+ aggregated** |
| Self-extension (skill/agent/tool) | ❌ | partial | ❌ | ✅ |
| README-as-contract verifier | ❌ | ❌ | ❌ | ✅ `quantum verify` |
| Auto-everything | ❌ | ❌ | ❌ | ✅ |
| MCP server + client roles | ❌ | ❌ | ⚠ | ✅ |
| NVIDIA GPU dev env | ❌ | ❌ | ❌ | ✅ |

## Install

```bash
mise install                    # node 26, python 3.14, pnpm, biome, sccache
pnpm install
cp .env.example .env            # add CLAUDE_CODE_OAUTH_TOKEN (claude setup-token)
pnpm link --global              # provides the `quantum` CLI
```

## Quickstart

```bash
quantum doctor                  # check auth, tools, agents, skills, gpu
quantum init                    # pull default skill packs
quantum run "summarise this repo in 5 bullets"
quantum chat                    # multi-turn (resume with --resume last)
quantum run --quantum "design a refactor of X"   # superpose → measure
quantum run --skill hyperplan "ship feature Y"   # 5 hostile critics
quantum tui                     # live dashboard of parallel branches
```

## Skills (400 000+ via aggregation)

```bash
quantum skill search "react accessibility"
quantum skill install gh:owner/repo
quantum skill install --pack openclaw-essentials      # +5400
quantum skill install --pack claude-code-essentials   # +30
quantum skill list
quantum skill translate hyperplan --to openclaw
quantum skill new "summarise PRs nightly to slack"    # meta-skill writes a new skill
quantum skill sync                                    # expose skills-core via .agents/skills
```

Sources (configured in `skills.sources.toml`):
- **SkillKit** (400 000+ skills, 31 upstreams, 46 agent formats)
- **ClawHub** (13 729 OpenClaw skills, vector search)
- **alirezarezvani/claude-skills** (232+, 9 domains)
- **awesome-claude-code-toolkit** (135 agents + 35 skills curated)
- **VoltAgent/awesome-openclaw-skills** (5 400+ filtered)
- **Local** (`./skills/`)

## Providers / runtimes

Quantum's default runtime is Claude via `@anthropic-ai/claude-agent-sdk`. That
SDK runs **Claude models only** (through Anthropic, Bedrock, Vertex, or
Foundry) — setting an OpenAI/Gemini/OpenRouter key does not make that runtime
use those models. To run non-Claude models, select a different runtime built on
its own official SDK. Optional runtimes are discoverable, not bundled: if the
package or secret is missing, Quantum prints the exact package/secret needed and
exits — no silent fallback.

```bash
quantum provider list                 # runtimes + required package/secret
quantum provider status               # selected runtime, model, capabilities
quantum provider select openai-agents --model gpt-5.1
quantum provider test                 # contract test (no call)
quantum provider test --live          # opt-in: minimal real call; NOT VERIFIED if not executed
```

Selection precedence: `QUANTUM_RUNTIME` / `QUANTUM_PROVIDER` / `QUANTUM_MODEL`
env vars override a persisted `provider select`, which overrides the `claude`
default. Secret **values** come only from Cursor Secrets / environment
variables (e.g. `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`); Quantum never stores or prints a key.

## MCP

Quantum is **both** an MCP server and an MCP client.

```bash
quantum serve --mcp --port 8765       # exposes quantum.* tools over HTTP/SSE
```

Connect from Claude desktop, Claude on iPhone/iPad (via GitHub MCP →
Quantum MCP), or any MCP-compatible client. Quantum itself uses Docker MCP,
GitHub MCP, the sequential-thinking MCP, and anything in `~/.claude/mcp.json`.

## Multi-modal

```bash
quantum see screenshot.png "what's broken in this UI"
quantum listen                  # voice input loop (whisper.cpp)
quantum run --speak "explain transformers"   # voice output
```

## Docker / GPU

```bash
docker compose -f docker/docker-compose.yml up -d quantum
docker compose exec quantum nvidia-smi
docker compose exec quantum quantum doctor
```

The image is built from `nvcr.io/nvidia/pytorch:latest` and includes
PyTorch + LangChain + Node 26 + Python 3.14 + mise pre-installed.

## Auto-everything

| Knob | What it does |
|---|---|
| `autowebsearch` | Before any non-trivial coding step, fetch latest patterns from the web. |
| `autoworkflow` | Canned flows: `issue→fix→PR`, `PR→review→merge`, `bug→repro→fix→test`, `RFC→hyperplan→implement`. |
| `autoupdate` | Weekly cron PR that bumps mise / deps / skill indexes / NVIDIA tag. |
| `autolearn` | Reflector after every task; novel patterns auto-drafted as new SKILL.md. |
| `autoverify` | `mise run green` after every commit; selfheal retries on red. |

```bash
quantum run --workflow issue-to-pr "Fix #123"
quantum autoupdate
quantum cache status
```

## Cache layer

| Layer | Mechanism |
|---|---|
| mise shims | `mise shim` (no PATH games) |
| pnpm store | content-addressed |
| Task cache | Turborepo-style, `hash(inputs+toolchain+env)` |
| Docker BuildKit | registry cache on GHCR |
| sccache | native compile (`better-sqlite3`, `sqlite-vec`) |
| Skill index | local mirror of SkillKit + ClawHub |
| Embeddings | `sqlite-vec`, `sha256(text+model)` |
| HTTP / WebFetch | `undici` RFC 9111 |
| LLM responses | sqlite, deterministic-only |
| Prompt caching | `cache_control: ephemeral` on system + tools (80–95 % hit rate) |

## Verify

`quantum verify` parses every fenced bash block in this README and
validates that each command head is a known `quantum` subcommand (or a
well-known external like `mise`, `pnpm`, `docker`, `git`, `claude`,
`curl`). Unknown commands fail the gate so the README never drifts from
the implemented CLI.

```bash
mise run green       # lint + test + verify
quantum verify       # README contract only
```

## Hard rules

1. **README is the spec.** Code matches what this file says, exactly.
2. **One-shot delivery.** No pauses; strategy diversification on failure.
3. **Latest of everything.** `.mise.toml` pins; `quantum autoupdate` keeps current.
4. **Surpass the field** on the union of: OAuth-native + quantum-loop +
   400k-skill aggregation + self-extension + auto-everything + README
   contract + NVIDIA GPU + multi-modal + mobile-via-GitHub + MCP-server-role.

## License

MIT — see [LICENSE](./LICENSE).
