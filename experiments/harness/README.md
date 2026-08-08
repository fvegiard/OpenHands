# Acceptance / benchmark harness (identical across lanes)

Deterministic, non-destructive, credential-safe. Run from the repo root:

```bash
python3 experiments/harness/run_acceptance.py --lane <lane-name> \
    --out experiments/lanes/<lane-name>/results-<lane-name>.json
```

- `rubric.json` — the shared, FROZEN rubric (task IDs `t01`–`t14` are identical
  across every lane; its sha256 is pinned in `../contract.lock.json`).
- `run_acceptance.py` — scores each lane on what it actually implements and
  **binds every scored item to a real command** (argv + real exit code +
  stdout/stderr sha256). Exits **non-zero** if any *critical* real item is not
  `PASS` (fail-closed).
- `gen_transcript.py` — runs the harness and emits a conformant, hash-chained
  JSONL transcript: one `command` + `test` event per real item, a `failure`
  event per real FAIL, and a verdict that is `PASS` **only** when all critical
  items really passed (otherwise `NOT_VERIFIED`).
- `validate_transcript.py` — the CI gate (see below).
- `test_transcript_gate.py` — red fixtures proving the gate rejects a missing
  transcript, a stale/foreign SHA, a hidden failed item, and a fabricated PASS.
- `compare_lanes.py` — the superiority gate.
- `skill_lint.py` — real skill-format check used as a command artifact.
- `results-<lane>.json` — machine-readable output (committed per lane for audit).

## Evidence classes (no false confidence)

Each task is classified by the shared policy in `run_acceptance.py`:

- **real** — a runnable command whose exit/output is scored. Only these count
  toward the benchmark score, and only a `real` passing `test` may back a
  `PASS`/`VERIFIED` verdict.
- **presence** — a structural/mock check (e.g. a skill file exists, `--resume`
  handled on a mock transport, a bounded repair path is present). This is
  **contract evidence only** and is reported `NOT_VERIFIED` — it can never carry
  a benchmark success. Real provider selection, live self-heal recovery under an
  injected failure, a real session resume, and true fresh-context skill loading
  need the running app / a provider secret and are therefore `NOT_VERIFIED` here.
- **live** — needs a provider secret; `NOT_VERIFIED` unless one of
  `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` is set. Secret
  values are never printed.

`score_ratio = benchmark_pass / benchmark_total` over `real` items only.

## The gate (`validate_transcript.py`)

Exits non-zero on any of: schema/seq violation, broken hash chain (tamper), raw
secret value, contract/base/rubric **drift**, a **missing** required-lane
transcript, a **stale head** (`--require-head`), an unreplayable command, a
**hidden failed item** (a PASS verdict with any failed test / failure event), a
**fabricated PASS** (a PASS not backed by a real passing test), or — with
`--require-pass` — a non-`PASS` verdict.

```bash
# audit (integrity only)
python3 experiments/harness/validate_transcript.py --require-lane synthesis
# real at-head gate (CI)
python3 experiments/harness/validate_transcript.py --require-lane synthesis \
    --require-head "$(git rev-parse HEAD)" --require-pass
```

CI (`.github/workflows/transcript-conformance.yml`) runs the fast integrity job
(contract lock + red fixtures + committed-lane integrity) and a
`regen-and-validate-head` job that **regenerates the cursor lane from real
commands at the checked-out HEAD** and requires a PASS bound to real evidence —
so a stale committed transcript can never carry the gate.

## Synthesis / superiority

`compare_lanes.py` declares a winner only when a lane has **100% critical local
acceptance** AND a strictly higher **identical runnable score** than every other
lane by a margin; otherwise `NOT_VERIFIED`. Absence of comparison lanes,
mismatched rubric versions, or a differing runnable item set all yield
`NOT_VERIFIED` — never a default win. True statistical superiority needs repeated
identical-seed runs. Integrate only evidence-backed winning commits via explicit
cherry-pick or small reimplementation, then re-run the full suite.
