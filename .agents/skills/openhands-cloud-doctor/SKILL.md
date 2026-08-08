---
name: openhands-cloud-doctor
description: Diagnose and self-heal the OpenHands Cursor cloud workspace. Use when the user asks to "check the environment", "is the app healthy", "run doctor", "diagnose install/start/build/secrets/network/migration 013/local sandbox/frontend/backend", "self-heal", or when a fresh cloud agent needs to confirm the workspace is working before starting a task.
triggers:
- openhands cloud doctor
- diagnose environment
- environment health
- self-heal
- is the app healthy
- migration 013
- local sandbox not running
---

# OpenHands Cloud Doctor

One command diagnoses the whole workspace, repairs safe transient failures, and
emits both a human summary and a machine-readable report. It composes the
existing repo commands (`make`, `poetry`, `curl`, `quantum`) — it does not
reimplement them.

## Run it

```bash
scripts/openhands-cloud doctor          # full diagnosis + bounded self-heal
scripts/openhands-cloud health          # quick backend+frontend HTTP check
scripts/openhands-cloud status          # ports, branch, running services
scripts/openhands-cloud help            # all subcommands
```

The machine-readable report is written to `$OHC_REPORT`
(default `/tmp/openhands-cloud-doctor.json`) as:

```json
{ "generated_at": "...", "checks": [ { "name": "backend", "status": "PASS|FAIL|REPAIRED", "ms": 16, "detail": "" } ] }
```

Exit code is `0` only when every check is `PASS` or `REPAIRED`.

## What it checks

| Check | What it proves |
|---|---|
| `install` | `poetry` env imports `openhands` and `frontend/node_modules` exists |
| `network` | outbound HTTPS reachable (informational) |
| `secrets` | which known secret **names** are set (values never printed) |
| `backend` | `GET /alive` and `/health` return 200 |
| `frontend` | Vite dev server returns 200 |
| `build-toolchain` | frontend build **toolchain** present (`vite` resolvable) — not a full production build (that runs in CI) |
| `migration013` | SQLite `alembic_version >= 013` and `conversation_metadata.execution_status` exists |
| `local-sandbox` | `POST /api/v1/sandboxes` reaches `RUNNING` (the local process-sandbox path) then cleans up |
| `quantum-green` | non-mutating gate in `quantum-agent`: `biome check` (never `--write`) + `tsc --noEmit` + `vitest run` + README `verify` |
| `repo-isolation` | no writable upstream remote and no auto upstream-sync / push-to-main workflow (`scripts/check-repo-isolation.py`) |

## Bounded self-heal (no infinite loop)

The `backend` check is the only transient-service check with a repair step:
if it fails, doctor runs `openhands-cloud start` **once**, then reruns the exact
check **once**. A healed check is recorded as `REPAIRED` (not `FAIL`). There is
no unbounded retry loop; every other check runs exactly once. This mirrors the
Quantum `self-heal` skill's "diagnose → change strategy → retry once" contract.

## When a check legitimately fails

- `secrets` reporting "none set" is expected in a fresh VM — live LLM/provider
  calls require the exact secret named by `quantum provider status`
  (e.g. `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
  Configure them as **Cursor Secrets**, never in code.
- `local-sandbox` FAIL usually means the co-located agent-server health check
  cannot reach loopback; confirm no stray `host.docker.internal` rewrite (see
  `openhands/app_server/sandbox/process_sandbox_service.py`).
