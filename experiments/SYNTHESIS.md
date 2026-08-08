# Synthesis comparison (evidence-cited)

Integration into `agent/provider-neutral-autonomy` draws **only** from lanes whose
transcripts are **VERIFIED** by `experiments/harness/validate_transcript.py`
(complete, schema-valid, tamper-evident, redacted, replayable) against the frozen
`experiments/contract.lock.json` (bundle `fd50d17f927fa9e8a32ed24ed0bd78ecd74fdc132f8665656702143c73518473`).

A lane with drift, missing events, unrecorded commands, changed benchmark
criteria, or an unsupported success claim is **NOT VERIFIED** and contributes no
code.

## How to read this file

Each claim cites exact evidence as `lane:transcript#<seq>` (a transcript event)
or `lane:artifact <path>@<sha256[:12]>` (a hashed artifact). No claim may rest on
prose alone.

## Lane status (fill from each lane's VERIFIED transcript)

| Lane | transcript VERIFIED | rubric score (artifact) | head SHA | notes |
|---|---|---|---|---|
| `experiment/claude-agent` | run `validate_transcript.py` | `results-claude-agent.json` | — | — |
| `experiment/codex-agent` | run `validate_transcript.py` | `results-codex-agent.json` | — | — |
| `experiment/mavis-minimax-m3` | run `validate_transcript.py` | `results-mavis-minimax-m3.json` | — | — |

## Integration decisions (evidence-cited)

For each candidate commit to cherry-pick or reimplement into the synthesis branch,
record:

- **Claim**: what capability improves.
- **Evidence**: `mavis-minimax-m3:transcript#<seq>` (the passing test/command) and
  `mavis-minimax-m3:artifact experiments/lanes/mavis-minimax-m3/results-mavis-minimax-m3.json@<sha>`.
- **Action**: `git cherry-pick <sha>` or "small reimplementation" (never a blind
  whole-branch merge).
- **Post-integration**: re-run the full suite on `agent/provider-neutral-autonomy`
  and its own transcript must remain VERIFIED.

No integration is recorded here until the contributing lane's transcript is
VERIFIED and the cited events exist. Do not claim perfect reasoning; VERIFIED
refers to transcript integrity + rubric evidence, not to correctness of judgment.
