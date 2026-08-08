# Experiment lane brief — provider-neutral autonomous agent

**Identical for every lane.** Base SHA (immutable): `1f43ce8112653f1f05e5b6bf0caf1534beb6114d`.
Lanes: `experiment/claude-agent`, `experiment/codex-agent`, `experiment/mavis-minimax-m3`.
Synthesis/integration branch: `agent/provider-neutral-autonomy` (never commit to `main`).

Each lane implements the **same goals** using its **own native agent strengths**.
Do **not** copy another lane's unverified implementation code. This brief and the
`experiments/harness/` acceptance suite are shared scaffolding and are meant to be
byte-identical across lanes.

## Goals (each lane implements all)

1. **Provider-neutral runtime** — a strict-typed runtime/provider abstraction with a
   discriminated union and boundary parsing. A native default runtime plus at least
   two discoverable optional runtimes that report the exact package + secret needed.
   No silent model/provider fallback: an invalid/unavailable selection exits with a
   precise diagnostic.
2. **Explicit provider switching without editing source** — commands equivalent to
   `provider list | status | select | test`, driven by env (`*_RUNTIME`,
   `*_PROVIDER`, `*_MODEL`) and/or a persisted selection. Secret **values** come only
   from environment/Cursor Secrets; print names only, never values.
3. **Self-heal** — bounded diagnose → change-strategy → retry-once on a failing step.
   No infinite loops; durable checkpoints; a machine-readable failure artifact.
4. **Skill evolution** — create/improve a lowercase-hyphenated skill with concise
   triggering metadata, validate its format, and forward-test it in ≥2 fresh contexts.
5. **Unattended permissions** — non-interactive permission mode mapped to the native
   runtime (e.g. bypass/full-access/approval-never) without pausing on routine
   filesystem/terminal/MCP/network actions. Preserve platform boundaries + secret
   redaction.
6. **CI** — deterministic install, lint (zero warnings), typecheck, unit tests,
   provider contract tests, skill validation, and the acceptance harness. Python 3.12;
   Node 22.12+ stable lane (Node 26 as a non-gating compatibility lane only).
7. **Doctor** — one command diagnosing install/start/build/secrets/network/migration/
   sandbox/frontend/backend with bounded repair + PASS/FAIL + timings.

## Rules

- Keep the repo **PRIVATE**; official upstream is **read-only** (no writes, no PRs).
- Never push to `main`; all work stays on the lane branch.
- Live billable provider calls run **only** when a matching secret already exists;
  otherwise use strict contract/fake-provider tests and report the exact untested
  secret name. A README/star claim is not evidence.

## Acceptance

Run the identical harness from the repo root:

```bash
python3 experiments/harness/run_acceptance.py --lane <lane-name> --out experiments/harness/results-<lane>.json
```

It runs the ≥10-task rubric (`experiments/harness/rubric.json`), scores each task,
and writes machine-readable results. Metrics: task success, tool correctness,
recovery from one injected transient failure, checkpoint/resume, provider switch,
skill creation + two fresh-context forward tests, latency, retries, and cost/tokens
(the last marked `NOT_VERIFIED` when no provider secret is present). Report sample
size and uncertainty; do not weaken tests or game the score.
