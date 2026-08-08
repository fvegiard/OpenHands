#!/usr/bin/env python3
"""Deterministic transcript conformance validator (the CI gate).

Fails (exit 1) on any drift or incomplete evidence:
  * schema violation (missing required fields / unknown type)
  * non-monotonic or gapped sequence IDs
  * broken hash chain (tamper)
  * mismatched contract/base/rubric hash (drift)
  * unrecorded command result (no exit_code / stdout hash) — not replayable
  * raw secret value present (redaction failure)
  * unsupported success claim (VERIFIED/PASS verdict without backing evidence)
  * missing required event types / no final verdict

VERIFIED integrity == complete + schema-valid + tamper-evident + redacted +
replayable. A lane that is NOT VERIFIED cannot contribute code to integration.

Usage:
  python3 validate_transcript.py --transcript <path.jsonl> \
      --contract-lock experiments/contract.lock.json \
      --base-sha 1f43ce8112653f1f05e5b6bf0caf1534beb6114d
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


def _walk_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _walk_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_strings(v)


def validate(transcript: Path, lock: dict, base_sha: str) -> list[str]:
    errors: list[str] = []
    try:
        events = read_jsonl(transcript)
    except Exception as e:
        return [f'cannot parse transcript: {e}']
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
    for needed in ('run_start', 'command', 'artifact', 'verdict'):
        if needed not in types:
            errors.append(f'missing required event type: {needed}')

    # 4. drift: contract/base/rubric hashes
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

    # 6. unsupported success claim
    verdict = events[-1] if events[-1]['type'] == 'verdict' else None
    if verdict:
        if verdict.get('result') not in VERDICT_RESULTS:
            errors.append(f'verdict.result invalid: {verdict.get("result")}')
        if verdict.get('result') in {'VERIFIED', 'PASS'}:
            backed = verdict.get('backed_by') or []
            if not backed:
                errors.append(
                    'verdict claims success with empty backed_by (unsupported)'
                )
            seqs = {e['seq'] for e in events}
            for b in backed:
                if b not in seqs:
                    errors.append(f'verdict backed_by cites non-existent event seq {b}')
            # at least one cited event must be a passing test or a zero-exit command
            support = [e for e in events if e['seq'] in backed]
            ok = any(
                (e['type'] == 'test' and e.get('failed', 1) == 0)
                or (e['type'] == 'command' and e.get('exit_code') == 0)
                for e in support
            )
            if support and not ok:
                errors.append(
                    'verdict success not supported by any passing test / zero-exit command'
                )

    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--transcript', required=True)
    ap.add_argument('--contract-lock', default='experiments/contract.lock.json')
    ap.add_argument('--base-sha', default='1f43ce8112653f1f05e5b6bf0caf1534beb6114d')
    args = ap.parse_args()

    lock = json.loads(Path(args.contract_lock).read_text())
    errors = validate(Path(args.transcript), lock, args.base_sha)
    if errors:
        print(
            f'transcript-conformance: NOT VERIFIED — {len(errors)} violation(s) in {args.transcript}'
        )
        for e in errors:
            print(f'  - {e}')
        return 1
    print(
        f'transcript-conformance: VERIFIED (complete, schema-valid, tamper-evident, redacted, replayable): {args.transcript}'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
