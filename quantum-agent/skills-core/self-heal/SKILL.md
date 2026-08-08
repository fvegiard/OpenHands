---
name: self-heal
description: After a failing gate, capture evidence and retry ONCE with a materially different strategy within a fixed retry budget; then stop with an explicit NOT VERIFIED failure. Trigger when a required gate (e.g. `mise run green`) exits non-zero.
allowed-tools: [Bash, Edit, Read, mcp__quantum__remember]
---

Bounded self-heal — no unbounded loops, no placeholders.

1. Capture the failing command and the last 1000 chars of stdout/stderr.
2. Persist them as facts (`selfheal-failure-*`) — a durable checkpoint.
3. Within a FIXED retry budget (default: **1** retry per failing step), choose
   ONE materially different strategy from every prior attempt for this task
   (different agent, model, smaller scope, contrarian) and retry once.
4. Re-run the EXACT failing gate to verify the outcome.
5. If it now passes, report the result with the captured evidence. If the retry
   budget is exhausted and the gate still fails, STOP and report an explicit
   **NOT VERIFIED** failure with the evidence and a machine-readable artifact.
6. NEVER stub, TODO, comment out, weaken, delete, or skip a required gate to
   make it "pass". A required gate either genuinely passes or is reported as a
   failure.
