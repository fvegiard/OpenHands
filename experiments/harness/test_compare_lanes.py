#!/usr/bin/env python3
"""Red fixtures for the superiority comparator.

Proves that a results file is only a valid comparison input when it is bound to a
validated, PASS, exact-head transcript — and that a fabricated/unbound/stale
result is rejected (never a silent winner). Runnable directly and via pytest.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from compare_lanes import compare, validate_lane  # noqa: E402
from transcript_lib import TranscriptWriter, sha256_file  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
BASE_SHA = '1f43ce8112653f1f05e5b6bf0caf1534beb6114d'
HEAD = 'c' * 40
LOCK = json.loads((REPO / 'experiments' / 'contract.lock.json').read_text())
TS = '2026-01-01T00:00:00Z'


def _results(lane: str, benchmark_pass: int, critical_ok: bool = True) -> dict:
    return {
        'summary': {
            'lane': lane,
            'rubric_version': '1.0.0',
            'head_sha': HEAD,
            'benchmark_pass': benchmark_pass,
            'benchmark_total': 2,
            'critical_ok': critical_ok,
        },
        'results': [
            {'id': 't01', 'evidence': 'real', 'status': 'PASS'},
            {'id': 't02', 'evidence': 'real', 'status': 'PASS'},
        ],
    }


def build_valid_lane(
    root: Path, lane: str, benchmark_pass: int = 2, head: str = HEAD
) -> Path:
    """A lane whose PASS transcript is bound to its results at an exact head."""
    d = root / lane
    d.mkdir(parents=True)
    res = d / f'results-{lane}.json'
    res.write_text(json.dumps(_results(lane, benchmark_pass), indent=2) + '\n')
    res_sha = sha256_file(res)
    w = TranscriptWriter(d / 'transcript.jsonl')
    w.append(
        'run_start',
        TS,
        agent=lane,
        model='m',
        runtime='r',
        branch='b',
        base_sha=BASE_SHA,
        head_sha=head,
        contract_bundle_sha256=LOCK['bundle_sha256'],
        rubric_sha256=LOCK['files']['harness/rubric.json'],
    )
    w.append('contract_ack', TS, contract_bundle_sha256=LOCK['bundle_sha256'])
    w.append(
        'command',
        TS,
        cmd='true',
        cwd='.',
        exit_code=0,
        stdout_sha256='0' * 64,
        stderr_sha256='0' * 64,
        evidence='real',
        item='t01',
    )
    t = w.append(
        'test',
        TS,
        name='t01',
        passed=1,
        failed=0,
        skipped=0,
        evidence='real',
        critical=True,
    )
    w.append(
        'artifact',
        TS,
        path=f'results-{lane}.json',
        sha256=res_sha,
        bytes=res.stat().st_size,
    )
    w.append('verdict', TS, result='PASS', backed_by=[t['seq']], score_ratio=1.0)
    return d


def test_valid_lane_is_accepted():
    with tempfile.TemporaryDirectory() as tmp:
        d = build_valid_lane(Path(tmp), 'good')
        ok, reason, data = validate_lane(d, LOCK, BASE_SHA)
        assert ok, reason
        assert data and data['benchmark_pass'] == 2


def test_fabricated_result_without_transcript_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / 'fabricated'
        d.mkdir(parents=True)
        (d / 'results-fabricated.json').write_text(
            json.dumps(_results('fabricated', 99)) + '\n'
        )
        ok, reason, _ = validate_lane(d, LOCK, BASE_SHA)
        assert not ok
        assert 'no transcript' in reason


def test_tampered_result_hash_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        d = build_valid_lane(Path(tmp), 'tampered')
        # Mutate the results file AFTER the transcript pinned its hash.
        res = d / 'results-tampered.json'
        res.write_text(json.dumps(_results('tampered', 999)) + '\n')
        ok, reason, _ = validate_lane(d, LOCK, BASE_SHA)
        assert not ok
        assert 'sha256' in reason


def test_stale_head_result_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        # transcript head != results head.
        d = Path(tmp) / 'stale'
        d.mkdir(parents=True)
        res = d / 'results-stale.json'
        res.write_text(json.dumps(_results('stale', 2)) + '\n')  # head=HEAD
        res_sha = sha256_file(res)
        w = TranscriptWriter(d / 'transcript.jsonl')
        w.append(
            'run_start',
            TS,
            agent='stale',
            model='m',
            runtime='r',
            branch='b',
            base_sha=BASE_SHA,
            head_sha='f' * 40,  # different head
            contract_bundle_sha256=LOCK['bundle_sha256'],
            rubric_sha256=LOCK['files']['harness/rubric.json'],
        )
        w.append('contract_ack', TS, contract_bundle_sha256=LOCK['bundle_sha256'])
        w.append(
            'command',
            TS,
            cmd='true',
            cwd='.',
            exit_code=0,
            stdout_sha256='0' * 64,
            stderr_sha256='0' * 64,
            evidence='real',
            item='t01',
        )
        t = w.append(
            'test',
            TS,
            name='t01',
            passed=1,
            failed=0,
            skipped=0,
            evidence='real',
            critical=True,
        )
        w.append(
            'artifact',
            TS,
            path='results-stale.json',
            sha256=res_sha,
            bytes=res.stat().st_size,
        )
        w.append('verdict', TS, result='PASS', backed_by=[t['seq']], score_ratio=1.0)
        ok, reason, _ = validate_lane(d, LOCK, BASE_SHA)
        assert not ok
        assert 'head' in reason


def test_one_lane_is_not_verified_and_two_can_win():
    a = {
        'rubric_version': '1.0.0',
        'critical_ok': True,
        'benchmark_pass': 2,
        'benchmark_total': 2,
        'real_ids': ['t01', 't02'],
        'head_sha': HEAD,
    }
    b = {
        'rubric_version': '1.0.0',
        'critical_ok': True,
        'benchmark_pass': 1,
        'benchmark_total': 2,
        'real_ids': ['t01', 't02'],
        'head_sha': HEAD,
    }
    assert compare({'a': a}, 1)[0] == 'NOT_VERIFIED'
    assert compare({'a': a, 'b': b}, 1)[0] == 'a'
    # Equal scores => within margin => NOT_VERIFIED.
    assert compare({'a': a, 'b': dict(b, benchmark_pass=2)}, 1)[0] == 'NOT_VERIFIED'


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    failed = 0
    for t in tests:
        try:
            t()
            print(f'  [PASS] {t.__name__}')
        except AssertionError as e:
            failed += 1
            print(f'  [FAIL] {t.__name__}: {e}')
    print()
    if failed:
        print(f'compare-lanes red-fixtures: {failed} FAILURE(S)')
        return 1
    print(f'compare-lanes red-fixtures: ALL {len(tests)} PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
