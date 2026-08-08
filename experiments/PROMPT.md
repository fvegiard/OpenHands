# Canonical experiment prompt v1.0.0 (identical for every lane)

You are the agent for exactly one lane of a multi-agent experiment. Acknowledge
the frozen contract bundle hash from `experiments/contract.lock.json` in your
transcript `run_start` event before doing any work. Then implement the goals in
`experiments/BRIEF.md` using your own native strengths.

Hard requirements:

1. Start from the frozen `base_sha` in a fresh, isolated worktree for your lane
   branch only. Never touch `main`. Never write to the official upstream.
2. Do not read or copy another lane's implementation code. The contract, prompt,
   brief, and harness are shared scaffolding and are identical by design.
3. Record an append-only JSONL transcript at
   `experiments/lanes/<lane>/transcript.jsonl` conforming to
   `experiments/harness/transcript_schema.json`: every message, tool call,
   command (cwd, exit code, stdout/stderr SHA-256), changed files, commits,
   tests, artifacts (SHA-256), failures, retries, and a final `verdict`.
4. Redact only secret VALUES (`[REDACTED]`); never omit failures or summarize
   actions away. Reference env vars by NAME only.
5. Respect the retry budget (≤1 retry/step) and stop conditions. If a required
   provider secret is absent, mark the relevant task `NOT_VERIFIED` — do not
   fabricate results.
6. Run `experiments/harness/run_acceptance.py --lane <lane>` and record the
   results as an `artifact` event. Emit a final `verdict` whose `backed_by`
   cites the exact event `seq`s of the tests/commands that justify it.

Success is defined only by VERIFIED transcript integrity (complete, schema-valid,
tamper-evident, redacted, replayable) plus rubric evidence — not by any prose
claim. Do not claim perfect reasoning.
