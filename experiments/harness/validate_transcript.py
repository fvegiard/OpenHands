#!/usr/bin/env python3
"""Deterministic transcript conformance validator (the CI gate).

Fails (exit 1) on any drift, incomplete evidence, or unearned success:
  * schema violation (missing required fields / unknown type)
  * non-monotonic or gapped sequence IDs
  * broken hash chain (tamper)
  * mismatched contract/base/rubric hash (drift)
  * missing transcript for the required lane (absence is NOT a pass)
  * stale head (run_start.head_sha != required head)
  * unrecorded command result (no exit_code / stdout+stderr hash) — not replayable
  * raw secret value present (redaction failure)
  * HIDDEN FAILED ITEM: a PASS/VERIFIED verdict while any test failed or a failure
    event exists
  * FABRICATED PASS: a PASS/VERIFIED verdict not backed by at least one real
    (evidence="real") passing test — presence/echo evidence can never carry a
    benchmark success
  * missing required event types / no final verdict

VERIFIED integrity == complete + schema-valid + tamper-evident + redacted +
replayable + honestly scored. A lane that is NOT VERIFIED cannot contribute code.

Usage:
  python3 validate_transcript.py --transcript <path.jsonl> \
      --contract-lock experiments/contract.lock.json \
      --base-sha 1f43ce8112653f1f05e5b6bf0caf1534beb6114d \
      [--require-lane synthesis] [--require-head <sha>] [--require-pass]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from transcript_lib import (  # noqa: E402
    GENESIS,
    REQUIRED_BY_TYPE,
    SECRET_PATTERNS,
    VERDICT_RESULTS,
    event_hash,
    read_jsonl,
)

REPO = Path(__file__).resolve().parents[2]


def _walk_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _walk_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_strings(v)


def validate(
    transcript: Path,
    lock: dict,
    base_sha: str,
    require_head: str | None = None,
    require_pass: bool = False,
) -> list[str]:
    errors: list[str] = []
    if not transcript.exists():
        return [f'transcript missing: {transcript} (absence is NOT VERIFIED)']
    try:
        events = read_jsonl(transcript)
    except Exception as exc:
        return [f'cannot parse transcript: {exc}']
    if not events:
        return ['empty transcript']

    # 1. schema + monotonic seq + redaction
    for idx, e in enumerate(events):
        where = f'event#{idx + 1}'
        if 'seq' not in e or 'type' not in e or 'ts' not in e or 'prev_hash' not in e:
            errors.append(f'{where}: missing common field(s)')
            continue
        if e['seq'] != idx + 1:
            errors.append(f'{where}: non-monotonic seq {e["seq"]} (expected {idx + 1})')
        req = REQUIRED_BY_TYPE.get(e['type'])
        if req is None:
            errors.append(f"{where}: unknown event type '{e['type']}'")
        else:
            for field in req:
                if field not in e:
                    errors.append(f"{where}({e['type']}): missing '{field}'")
        for s in _walk_strings({k: v for k, v in e.items()}):
            for pat in SECRET_PATTERNS:
                if pat.search(s):
                    errors.append(
                        f'{where}: raw secret value detected (redaction failure)'
                    )
                    break

    # 2. hash chain (tamper-evidence)
    prev = GENESIS
    for idx, e in enumerate(events):
        if e.get('prev_hash') != prev:
            errors.append(
                f'event#{idx + 1}: broken hash chain (prev_hash mismatch — tampered)'
            )
        prev = event_hash(e)

    # 3. structural completeness
    if events[0]['type'] != 'run_start':
        errors.append('first event must be run_start')
    if events[-1]['type'] != 'verdict':
        errors.append('last event must be verdict')
    types = [e['type'] for e in events]
    for needed in ('run_start', 'command', 'test', 'artifact', 'verdict'):
        if needed not in types:
            errors.append(f'missing required event type: {needed}')

    # 4. drift: contract/base/rubric hashes + head freshness
    rs = events[0] if events[0]['type'] == 'run_start' else {}
    if rs:
        if rs.get('base_sha') != base_sha:
            errors.append(f'drift: base_sha {rs.get("base_sha")} != frozen {base_sha}')
        if rs.get('contract_bundle_sha256') != lock.get('bundle_sha256'):
            errors.append('drift: contract_bundle_sha256 != contract.lock.json')
        if rs.get('rubric_sha256') != lock.get('files', {}).get('harness/rubric.json'):
            errors.append(
                'drift: rubric_sha256 != frozen rubric hash (changed benchmark criteria)'
            )
        if require_head is not None and rs.get('head_sha') != require_head:
            errors.append(
                f'stale head: run_start.head_sha {rs.get("head_sha")} != required {require_head}'
            )

    # 5. replayability: every command must record an exit code + output hashes
    for idx, e in enumerate(events):
        if e['type'] == 'command':
            if not isinstance(e.get('exit_code'), int):
                errors.append(
                    f'event#{idx + 1}: command without integer exit_code (unrecorded result)'
                )
            if not e.get('stdout_sha256') or not e.get('stderr_sha256'):
                errors.append(
                    f'event#{idx + 1}: command without stdout/stderr hash (not replayable)'
                )

    # 6. honest scoring: no hidden failures, no fabricated / mislabeled success
    tests = [e for e in events if e['type'] == 'test']
    failures = [e for e in events if e['type'] == 'failure']
    real_pass_seqs = {
        e['seq']
        for e in tests
        if e.get('evidence') == 'real'
        and int(e.get('passed', 0)) >= 1
        and int(e.get('failed', 0)) == 0
    }
    verdict = events[-1] if events[-1]['type'] == 'verdict' else None
    if verdict:
        if verdict.get('result') not in VERDICT_RESULTS:
            errors.append(f'verdict.result invalid: {verdict.get("result")}')
        is_success = verdict.get('result') in {'VERIFIED', 'PASS'}
        if require_pass and not is_success:
            errors.append(
                f'required PASS but verdict is {verdict.get("result")} (lane NOT VERIFIED)'
            )
        if is_success:
            # (a) hidden failed item: any failed test or failure event forbids PASS
            failed_tests = [t for t in tests if int(t.get('failed', 0)) > 0]
            if failed_tests:
                errors.append(
                    f'hidden failed item: verdict PASS but {len(failed_tests)} test(s) failed '
                    f'({", ".join(t.get("name", "?") for t in failed_tests)})'
                )
            if failures:
                errors.append(
                    f'verdict PASS but {len(failures)} failure event(s) recorded (hidden failure)'
                )
            # (b) fabricated / mislabeled PASS: must be backed by a REAL passing test
            backed = verdict.get('backed_by') or []
            if not backed:
                errors.append(
                    'verdict claims success with empty backed_by (unsupported)'
                )
            seqs = {e['seq'] for e in events}
            for b in backed:
                if b not in seqs:
                    errors.append(f'verdict backed_by cites non-existent event seq {b}')
            if not (set(backed) & real_pass_seqs):
                errors.append(
                    'fabricated PASS: verdict not backed by any real (evidence="real") '
                    'passing test — presence/echo evidence cannot carry a benchmark success'
                )

    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--transcript', default=None)
    ap.add_argument('--require-lane', default=None)
    ap.add_argument('--require-head', default=None)
    ap.add_argument('--require-pass', action='store_true')
    ap.add_argument('--contract-lock', default='experiments/contract.lock.json')
    ap.add_argument('--base-sha', default='1f43ce8112653f1f05e5b6bf0caf1534beb6114d')
    args = ap.parse_args()

    if args.require_lane:
        path = REPO / 'experiments' / 'lanes' / args.require_lane / 'transcript.jsonl'
    elif args.transcript:
        path = Path(args.transcript)
    else:
        print('error: pass --transcript or --require-lane')
        return 2

    lock = json.loads(Path(args.contract_lock).read_text())
    errors = validate(
        path,
        lock,
        args.base_sha,
        require_head=args.require_head,
        require_pass=args.require_pass,
    )
    if errors:
        print(
            f'transcript-conformance: NOT VERIFIED — {len(errors)} violation(s) in {path}'
        )
        for e in errors:
            print(f'  - {e}')
        return 1
    print(
        f'transcript-conformance: VERIFIED (complete, schema-valid, tamper-evident, '
        f'redacted, replayable, honestly scored): {path}'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
