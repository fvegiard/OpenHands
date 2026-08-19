# Mavis Plugin — `openagent`

> **This document is the entry point for the `dev/mavis-plugin` branch of
> `fvegiard/OpenHands`.** Read it first; everything else is glue.

## TL;DR

This branch packages `All-Hands-AI/OpenHands` (hereafter "openagent") as a
**Mavis plugin** so it runs as a first-class Mavis connector instead of a
standalone CLI. Concretely, the branch adds:

| Layer | What | Where |
|------|------|-------|
| **Manifest** | `.minimax-plugin/manifest.json` (schemaVersion 1) — declares 1 MCP server + 25 skills | `.minimax-plugin/` |
| **Mavis bridge** | Python package — FastMCP stdio server + AgentBridge + runtime client + telemetry | `mavis_bridge/openclaw_m3/` |
| **Skills** | 25 OpenHands shareable skills ported from `name/type/agent/triggers` → Mavis `name/description` frontmatter | `skills/<name>/SKILL.md` |
| **Install** | One-shot installer that symlinks the plugin into a Mavis runtime + smoke test | `install.sh` |
| **Tests** | 6/6 unit tests covering bridge, manifest, skills_sync | `mavis_bridge/tests/test_bridge.py` |

The upstream OpenHands code (Python backend, React frontend, runtime, etc.)
is **untouched** — the Mavis layer is purely additive. To re-sync with
`All-Hands-AI/OpenHands` upstream, rebase `main` into `dev/mavis-plugin`
and the Mavis files will reapply on top.

## Why a plugin, not a fork

A fork would have to maintain a permanent diff against upstream and merge
in every release. A plugin is a separate concern:

1. The plugin's contract with Mavis is just the manifest — if OpenHands
   rewrites its internals, only the manifest's skill names and tool names
   need updating.
2. The bridge is a *thin* shim (FastMCP, no business logic) — anything
   real happens in OpenHands proper.
3. Users who don't want the Mavis integration can ignore the
   `.minimax-plugin/` and `mavis_bridge/` directories entirely.

## What changed in `dev/mavis-plugin` vs `main`

```
.minimax-plugin/manifest.json          ← NEW
mavis_bridge/                          ← NEW
  __init__.py
  openclaw_m3/
    __init__.py
    agent_bridge.py
    manifest.py
    mcp_server.py
    runtime.py
    telemetry.py
  skills_sync.py
  tests/
    __init__.py
    test_bridge.py
skills/<24 skill names>/SKILL.md       ← NEW (port of openhands/skills/*.md)
install.sh                             ← NEW
MAVIS_PLUGIN.md                        ← NEW (this file)
```

(OpenHands proper, the React frontend, quantum-agent, AGENTS.md, etc. are
all unchanged.)

## MCP contract

The plugin exposes one stdio MCP server, `openagent-mcp`, with four tools:

| Tool | Purpose |
|------|---------|
| `openagent_execute_task(task, workspace)` | Start an OpenHands runtime session and run a task |
| `openagent_get_status(session_id)` | Poll session state |
| `openagent_list_skills()` | List the 25 skills declared in the manifest |
| `openagent_sync_context({active_skills: [...]})` | Push Mavis-side context into the OpenHands event stream |

Mavis spawns the server with `python -m mavis_bridge.openclaw_m3.mcp_server`.
The server reads `.minimax-plugin/manifest.json` for skill names and talks
to a running OpenHands backend at `$OPENHANDS_BASE_URL` for the heavy
lifting.

## How to install into a Mavis runtime

```bash
# from inside the fvegiard/OpenHands repo, branch dev/mavis-plugin
./install.sh
# or: ./install.sh --runtime /path/to/some/mavis
```

The installer:

1. Symlinks the repo into `$MAVIS_RUNTIME/.plugin-cache/openagent-mavis`
2. Installs `fastmcp` + `pyyaml` into the user Python
3. Runs a smoke test (load manifest, init bridge, sync 1 skill)

Then restart the Mavis runtime to pick up the plugin.

## Syncing with upstream OpenHands

```bash
git fetch upstream
git checkout dev/mavis-plugin
git rebase upstream/main
# resolve any conflicts (typically: skills/ subdirs if upstream added new ones)
# then:
python mavis_bridge/skills_sync.py --src skills/ --dst skills/ --verify
git add . && git commit -m "chore: rebase onto upstream/main + re-sync skills"
```

The skill port is idempotent — re-running `skills_sync.py` overwrites
`skills/<name>/SKILL.md` from the openagent source, but preserves the
`<!-- mavis: ... -->` block if you ever add one.

## What's NOT done (honest)

- **No live integration test against a running OpenHands backend.** The
  `OpenHandsClient` in `mavis_bridge/openclaw_m3/runtime.py` is wired but
  I didn't stand up an OpenHands instance to hit. The smoke test uses
  the bridge directly.
- **No real Mavis runtime to load the plugin into.** The
  `.plugin-cache/openagent-mavis` symlink target is a convention I
  reverse-engineered from `/workspace/.plugin-cache`; if your Mavis
  runtime uses a different layout, edit `install.sh`.
- **No 1:1 mapping of every OpenHands integration.** The 25 shareable
  skills are ported, but the 30+ runtime integrations (Slack, GitHub
  webhooks, Linear, etc.) are not. They'd belong in the manifest's
  `mcpServers` array as additional MCP servers if you want them
  available as Mavis tools.
- **No docs site / changelog entry.** This is the working branch, not
  a release.

## What this enables

Once the plugin is loaded, Mavis can:

- `list_openagent_skills` and dispatch to any of the 25
- `openagent_execute_task("review the diff on branch dev/x", "/repo")`
  and have OpenHands do the multi-step work
- Treat `openagent` as a Mavis tool group next to `pdf`, `excel`,
  `notion`, `superpowers`, `superdesign`, `ppt`, `everme`
- Compose: `superpowers/brainstorming → openagent/code-review →
  mavis-memory topic-append` as a single Mavis plan
