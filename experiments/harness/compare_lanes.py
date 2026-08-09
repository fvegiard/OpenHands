#!/usr/bin/env python3
"""Superiority gate for synthesis — every comparison input must be PROVEN.

A lane's `results-<lane>.json` is only a valid comparison input when it is bound
to a VALIDATED, exact-head transcript for that lane:
  * the lane's `transcript.jsonl` passes `validate_transcript.validate(...)`
    (schema + tamper chain + base/contract/rubric drift + replayable command
    events + honest scoring) AND its verdict is PASS (`require_pass`);
  * the results file's sha256 equals the transcript's recorded `artifact` hash
    (so a swapped/fabricated results file is rejected);
  * `results.summary.head_sha` equals the transcript's `run_start.head_sha`
    (exact-head identity).

A lane may be declared SUPERIOR only when it has 100% local critical acceptance
AND a strictly higher IDENTICAL runnable score than every other VALID lane by a
margin. Otherwise NOT_VERIFIED (one validated lane is honestly NOT_VERIFIED).

In `--enforce` mode the gate exits non-zero when any lane that ships a
`results-*.json` is NOT backed by such proof (a fabricated second result cannot
silently become a comparison input), or when a winner is asserted without a
validated exact-head transcript.

Usage:
  python3 experiments/harness/compare_lanes.py [--margin 1] [--enforce]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from transcript_lib import read_jsonl, sha256_file  # noqa: E402
from validate_transcript import validate  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
LANES = REPO / 'experiments' / 'lanes'
BASE_SHA = '1f43ce8112653f1f05e5b6bf0caf1534beb6114d'


def validate_lane(
    lane_dir: Path, lock: dict, base_sha: str
) -> tuple[bool, str, dict | None]:
    """Validate a lane and bind its results to a PASS exact-head transcript."""
    results = sorted(lane_dir.glob('results-*.json'))
    transcript = lane_dir / 'transcript.jsonl'
    if not results:
        return False, 'no results-*.json', None
    if len(results) != 1:
        return False, f'expected exactly one results-*.json, found {len(results)}', None
    res_path = results[0]
    if not transcript.exists():
        return False, 'results present but no transcript.jsonl (unbound)', None

    errors = validate(transcript, lock, base_sha, require_pass=True)
    if errors:
        return False, f'transcript NOT VERIFIED ({len(errors)}): {errors[0]}', None

    events = read_jsonl(transcript)
    run_start = events[0]
    head = run_start.get('head_sha')
    # Bind results file to the transcript's recorded artifact hash.
    want = res_path.name
    artifact = next(
        (
            e
            for e in events
            if e.get('type') == 'artifact' and str(e.get('path', '')).endswith(want)
        ),
        None,
    )
    if artifact is None:
        return False, f'no artifact event references {want} (results unbound)', None
    if artifact.get('sha256') != sha256_file(res_path):
        return (
            False,
            f'{want} sha256 != transcript artifact hash (tampered/fabricated)',
            None,
        )

    data = json.loads(res_path.read_text())
    summary = data.get('summary', {})
    if summary.get('head_sha') != head:
        return (
            False,
            (
                f'results head {summary.get("head_sha")} != transcript head {head} (stale)'
            ),
            None,
        )

    real_ids = sorted(
        r['id'] for r in data.get('results', []) if r.get('evidence') == 'real'
    )
    return (
        True,
        'validated (PASS transcript, bound results, exact head)',
        {
            'head_sha': head,
            'rubric_version': summary.get('rubric_version'),
            'critical_ok': bool(summary.get('critical_ok')),
            'benchmark_pass': int(summary.get('benchmark_pass', 0)),
            'benchmark_total': int(summary.get('benchmark_total', 0)),
            'real_ids': real_ids,
        },
    )


def compare(valid: dict[str, dict], margin: int) -> tuple[str, str]:
    if len(valid) < 2:
        return 'NOT_VERIFIED', (
            f'insufficient VALIDATED lanes to compare ({sorted(valid)}); '
            'need >=2 with identical rubric + runnable set'
        )
    if len({v['rubric_version'] for v in valid.values()}) != 1:
        return 'NOT_VERIFIED', 'mismatched rubric versions across validated lanes'
    if len({tuple(v['real_ids']) for v in valid.values()}) != 1:
        return (
            'NOT_VERIFIED',
            'validated lanes do not share an identical runnable item set',
        )
    eligible = {k: v for k, v in valid.items() if v['critical_ok']}
    if len(eligible) < 2:
        return 'NOT_VERIFIED', 'fewer than two lanes reached 100% critical acceptance'
    ranked = sorted(
        eligible.items(), key=lambda kv: kv[1]['benchmark_pass'], reverse=True
    )
    top, second = ranked[0], ranked[1]
    if top[1]['benchmark_pass'] - second[1]['benchmark_pass'] >= margin:
        return top[0], (
            f'{top[0]} superior: critical_ok + score '
            f'{top[1]["benchmark_pass"]}/{top[1]["benchmark_total"]} > '
            f'{second[0]} {second[1]["benchmark_pass"]} (margin>={margin})'
        )
    return 'NOT_VERIFIED', (
        f'top two within margin ({top[0]}={top[1]["benchmark_pass"]}, '
        f'{second[0]}={second[1]["benchmark_pass"]}); not superior'
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--margin', type=int, default=1)
    ap.add_argument('--enforce', action='store_true')
    ap.add_argument(
        '--contract-lock', default=str(REPO / 'experiments' / 'contract.lock.json')
    )
    ap.add_argument('--base-sha', default=BASE_SHA)
    args = ap.parse_args()

    lock = json.loads(Path(args.contract_lock).read_text())
    valid: dict[str, dict] = {}
    invalid: dict[str, str] = {}
    # Only lanes that SHIP a results-*.json are comparison inputs; each must prove
    # itself. A lane dir with no results is simply absent (not a failure).
    for lane_dir in sorted(p for p in LANES.iterdir() if p.is_dir()):
        if not list(lane_dir.glob('results-*.json')):
            continue
        ok, reason, data = validate_lane(lane_dir, lock, args.base_sha)
        if ok and data is not None:
            valid[lane_dir.name] = data
        else:
            invalid[lane_dir.name] = reason

    winner, reason = compare(valid, args.margin)
    out = {
        'winner': winner,
        'reason': reason,
        'validated_lanes': valid,
        'invalid_lanes': invalid,
        'enforce': args.enforce,
    }
    print(json.dumps(out, indent=2))

    if not args.enforce:
        return 0
    # Enforcement: fail on any unproven comparison input, or an unbacked winner.
    if invalid:
        print(
            f'ENFORCE FAIL: {len(invalid)} lane(s) ship results without a validated '
            f'exact-head transcript: {sorted(invalid)}'
        )
        return 1
    if winner != 'NOT_VERIFIED' and winner not in valid:
        print(
            f'ENFORCE FAIL: winner {winner} is not a validated lane (superiority without proof)'
        )
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
