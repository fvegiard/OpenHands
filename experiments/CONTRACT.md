# Experiment contract v1.0.0 (frozen)

This contract governs the multi-agent experiment. It is **frozen**: any change
requires a new `contract_version` and a new bundle hash. Every lane must
acknowledge the identical bundle hash (see `experiments/contract.lock.json`)
**before** doing work, in its transcript `run_start` event.

## Immutable parameters

- **contract_version**: `1.0.0`
- **base_sha** (every lane starts here, fresh isolated worktree):
  `1f43ce8112653f1f05e5b6bf0caf1534beb6114d`
- **lanes**: `experiment/claude-agent`, `experiment/codex-agent`,
  `experiment/mavis-minimax-m3`
- **synthesis/integration branch**: `agent/provider-neutral-autonomy`
  (never commit to `main`)
- **frozen bundle** (hashed in `contract.lock.json`): `CONTRACT.md`, `PROMPT.md`,
  `BRIEF.md`, `harness/rubric.json`

## Frozen test corpus, rubric, fixtures

- **corpus + rubric**: `experiments/harness/rubric.json` (rubric_version pinned in
  the lock). The rubric, task set, and scoring may not change during a run; a
  changed rubric hash is drift and fails conformance.
- **fixtures**: deterministic, checked into each lane under
  `experiments/lanes/<lane>/fixtures/` if any; each fixture is hashed as an
  `artifact` event.

## Environment variables (by NAME only — values never recorded)

- Live provider secrets (optional; enable billable tasks only if already set):
  `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY`.
- Runtime selection: `QUANTUM_RUNTIME`, `QUANTUM_PROVIDER`, `QUANTUM_MODEL`,
  `QUANTUM_HOME`.
- Only NAMES may appear in transcripts. Any raw secret VALUE is a redaction
  failure.

## Retry budget & stop conditions

- **retry_budget**: at most **1** retry per failing step (bounded self-heal).
- **stop conditions**: (a) all rubric tasks attempted and a `verdict` emitted; or
  (b) retry budget exhausted on a blocking step; or (c) a required credential is
  absent (record `NOT_VERIFIED`, do not fabricate). No infinite loops.

## Evidence rules

- Each lane produces an **append-only** `experiments/lanes/<lane>/transcript.jsonl`
  and a rendered `transcript.md`.
- Record every user/agent message, tool call, command (with cwd, exit code,
  sanitized stdout/stderr hashes), changed files, commits, tests, artifacts
  (with SHA-256), failures, retries, and a final verdict.
- **Redact only secret VALUES / private tokens** (replace with `[REDACTED]`).
  Never omit failures or silently summarize away actions.

## VERIFIED transcript integrity

A lane is **VERIFIED** only if its transcript is: complete (all required event
types present), schema-valid, tamper-evident (unbroken hash chain + monotonic
sequence IDs), redacted (no raw secret values), and replayable (recorded
commands + hashes). Any lane with drift (mismatched contract/base/rubric hash),
missing events, unrecorded commands, changed benchmark criteria, or an
unsupported success claim is **NOT VERIFIED** and **cannot contribute code** to
integration.
