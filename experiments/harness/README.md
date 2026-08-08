# Acceptance / benchmark harness (identical across lanes)

Deterministic, non-destructive, credential-safe. Run from the repo root:

```bash
python3 experiments/harness/run_acceptance.py --lane <lane-name> \
    --out experiments/harness/results-<lane-name>.json
```

- `rubric.json` — the shared ≥10-task rubric and metric list.
- `run_acceptance.py` — capability + contract probes; scores each lane on what it
  actually implements. Tasks not implemented score `MISSING` (0); live-provider
  tasks are `NOT_VERIFIED` (excluded from the ratio) unless a matching secret is set.
- `results-<lane>.json` — machine-readable output (committed per lane for audit).

## Scoring & comparison

`score_ratio = PASS / (scored tasks)` where scored excludes `NOT_VERIFIED`.
Compare lanes on: `score_ratio`, per-category PASS, `total_latency_ms`,
`total_retries`, and the `cost_tokens` field (only meaningful with a live secret).
State sample size (number of scored tasks) and re-run ≥3× for latency stability
where a live provider is involved.

## Live metrics (require credentials)

`t14-live-provider-call` and real cost/token/recovery-under-load numbers need a
Cursor Secret: one of `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`. Without it those remain `NOT_VERIFIED` by design — never fabricate
them. Secret values are never printed by this harness.

## Synthesis

After all lanes commit their `results-<lane>.json`, integrate only evidence-backed
winning commits into `agent/provider-neutral-autonomy` via explicit cherry-pick or
small reimplementation — never a blind whole-branch merge — then re-run the full
suite on the synthesis branch.
