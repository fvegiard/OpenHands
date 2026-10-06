# ACP agents on Windows: fixes, upgrades, and side-by-side stacks

Field notes from running the Agent Canvas full stack on Windows with Claude Code
as an ACP agent. Covers a Windows-specific SDK bug and its patch, a sandbox
procedure for testing newer ACP provider versions, running two isolated stacks
side-by-side, model selection, and MCP behavior.

## 1. Windows spawn bug (WinError 2) in the agent-server SDK

**Symptom.** Onboarding Claude Code succeeds, but the first message ends in an
error state. The agent-server log shows `FileNotFoundError: [WinError 2]`
when spawning the ACP subprocess.

**Root cause.** The SDK spawns the ACP provider with a bare `npx` via
`asyncio.create_subprocess_exec`. On Windows, `CreateProcess` does **not**
search `PATHEXT`, so bare `npx` never resolves to `npx.cmd`. Unix is unaffected
because `execvp` searches `PATH` for the exact name and `npx` exists there as a
symlink.

**Fix.** Patch `openhands/sdk/agent/acp_agent.py` in the installed SDK (the uvx
ephemeral env) to resolve the executable first:

```python
import shutil  # top of file

# in the spawn path, before create_subprocess_exec:
command = shutil.which(command) or command

# in _warm_npx_cache:
shutil.which("npx") or "npx"
```

The patch lives in the uv cache (`%LOCALAPPDATA%\uv\cache\archive-v0\...`) and
survives restarts, but `uv cache clean` reverts it. This is upstream-worthy:
the real fix belongs in the `software-agent-sdk` repo.

## 2. Testing a newer ACP provider version in a sandbox

The SDK pins `CLAUDE_AGENT_ACP_VERSION` (e.g. `0.63.0`) in
`openhands/sdk/settings/acp_install_catalog.py`. To test a newer
`@agentclientprotocol/claude-agent-acp` without touching the installed SDK:

1. Copy the package: `robocopy <site-packages>\openhands sandbox-acp\openhands /E`
2. Bump the pin in the sandbox copy's `acp_install_catalog.py`
3. Run `scripts/test-acp-version.py <expected-version>` from inside the sandbox
   dir. It puts the sandbox first on `sys.path` (shadowing the installed SDK),
   starts a real ACP conversation, and passes when Claude Code replies
   (`FINISHED` status). ACP replies arrive as a `FinishAction` inside an
   `ActionEvent`, not a `MessageEvent` — the harness captures both.

Verified working this way: **0.85.1** and **0.86.0** (latest stable).

To run the whole stack against the sandbox SDK, set `PYTHONPATH` to the sandbox
dir before `npm run dev` — `scripts/dev-with-automation.mjs` spawns the
agent-server with the full parent environment, so the sandbox copy shadows the
installed SDK. Proof in the agent-server log:

```
ACP provider version: provider=claude-code, pinned_version='0.86.0', ... reported_version='0.86.0'
```

## 3. Two stacks side-by-side (ports and state)

`scripts/dev-with-automation.mjs` accepts port/state overrides via env vars,
so a second isolated stack can run next to the default one:

| Service    | Stack 1 (default) | Stack 2 (example) | Override var |
|------------|-------------------|-------------------|--------------|
| Ingress/UI | 8000              | 8001              | `PORT` |
| Backend    | 18000             | 18010             | `OH_CANVAS_SAFE_BACKEND_PORT` |
| Automation | 18001             | 18011             | `OH_CANVAS_SAFE_AUTOMATION_PORT` |
| Vite       | 3101              | 3102              | `OH_CANVAS_SAFE_VITE_PORT` |
| State dir  | `~/.openhands/agent-canvas` | `~/.openhands/agent-canvas-0851` | `OH_CANVAS_SAFE_STATE_DIR` |

Each stack needs its own state dir (conversations, secrets, API key) and its
own ports. The vscode port is always `backend + 1000`. Example launch:

```cmd
set PORT=8001
set OH_CANVAS_SAFE_BACKEND_PORT=18010
set OH_CANVAS_SAFE_AUTOMATION_PORT=18011
set OH_CANVAS_SAFE_VITE_PORT=3102
set OH_CANVAS_SAFE_STATE_DIR=%USERPROFILE%\.openhands\agent-canvas-0851
set PYTHONPATH=C:\path\to\sandbox-acp
npm run dev
```

Both stacks share only the host Claude Code login. Note port 3001 may be taken
by unrelated local services (e.g. an Open WebUI Docker container) — pick a free
vite port instead of killing anything.

## 4. Choosing the Claude model

Two places, both live:

- **Per conversation (live switch):** the model dropdown in the composer, left
  of Send. Calls `POST /api/conversations/{id}/switch_acp_model`, which does a
  bounded `session/set_model` round-trip with the running ACP subprocess and
  persists the choice. No restart; takes effect on the next message.
- **Default for new conversations:** Settings → Agent → the Claude Code
  profile → **Model** dropdown (or **Custom** for any model ID). Writes
  `agent_settings.acp_model`.

The composer list merges the SDK's curated entries with the live session's
`availableModels` reported at `session/new` — the live list is authoritative
and may be richer (e.g. it can include models the curated list predates).

## 5. MCP: two independent layers

- **OpenHands MCP page** (Customize → MCP Servers): servers installed here are
  managed by the local backend and **forwarded into every ACP session**
  (verified: the GitHub MCP server appears as ACP tool calls).
- **Claude Code's own connectors:** because the ACP subprocess runs the host's
  Claude Code with the user's own config, personal claude.ai connectors (and
  any `~/.claude.json` MCP entries) also appear. They authorize through
  claude.ai connector settings or `/mcp` in an interactive Claude Code session
  — not through the Canvas UI. A stale entry (dead endpoint) makes Claude Code
  report "failed to connect" at session start; remove it in claude.ai settings.

## 6. Chrome Dev on the discrete GPU

`scripts/launch-canvas-dev-chrome.cmd` launches Chrome Dev with a dedicated
profile and GPU flags (`--force-high-performance-gpu` etc.) so the canvas UI
renders on the NVIDIA dGPU instead of the iGPU, and works around the
`BindToCurrentSequence failed` WebGL error seen with recent NVIDIA drivers.
The dedicated profile is required: Chrome silently ignores GPU flags when an
instance with the default profile is already running.

## 7. Agent-server REST API (headless verification)

When the UI is busy, the agent-server REST API can drive a conversation
directly. The session API key is at `<state-dir>/api-key.txt`; send it as
`X-Session-API-Key`. Useful routes (`GET /openapi.json` for the full list):

- `GET /api/conversations/{id}` — execution status, agent config, available models
- `GET /api/conversations/{id}/events/search?limit=100&sort_order=TIMESTAMP_DESC`
- `POST /api/conversations/{id}/events` with a `SendMessageRequest`
  (`{"role":"user","run":true,"content":[{"type":"text","text":"..."}]}`) —
  injects a message exactly as if typed in the UI and runs the agent loop
- `POST /api/conversations/{id}/switch_acp_model` with `{"model":"sonnet"}` —
  live model switch

Known UI limitation: the canvas **Browser** panel renders observations from the
OpenHands native agent's `browser_tool_set` only. ACP agents (Claude Code) run
their own tool stack inside the ACP subprocess and cannot write to it — their
terminal/file/MCP tool calls still stream into the conversation timeline.
