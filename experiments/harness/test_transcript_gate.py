#!/usr/bin/env python3
"""Red-fixture tests for the transcript conformance gate.

Proves the validator REJECTS the false-confidence modes called out in review:
  * missing transcript (absence must never pass),
  * stale head/base/contract SHA,
  * hidden failed item (a failed test / failure event under a PASS verdict),
  * fabricated PASS (a PASS verdict not backed by a real passing test),
  * a NOT_VERIFIED verdict under --require-pass.

Each fixture is built with a VALID hash chain (via TranscriptWriter), so these
exercise the SEMANTIC gate, not merely tamper detection. Runnable directly
(`python3 experiments/harness/test_transcript_gate.py`) and via pytest.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from transcript_lib import TranscriptWriter  # noqa: E402
from validate_transcript import validate  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
BASE_SHA = '1f43ce8112653f1f05e5b6bf0caf1534beb6114d'
HEAD = 'a' * 40
LOCK = json.loads((REPO / 'experiments' / 'contract.lock.json').read_text())
TS = '2026-01-01T00:00:00Z'


def _writer(tmp: Path) -> TranscriptWriter:
    return TranscriptWriter(tmp / 'transcript.jsonl')


def _run_start(
    w: TranscriptWriter, *, base=BASE_SHA, head=HEAD, bundle=None, rubric=None
) -> None:
    w.append(
        'run_start',
        TS,
        agent='x',
        model='m',
        runtime='r',
        branch='b',
        base_sha=base,
        head_sha=head,
        contract_bundle_sha256=bundle or LOCK['bundle_sha256'],
        rubric_sha256=rubric or LOCK['files']['harness/rubric.json'],
    )
    w.append('contract_ack', TS, contract_bundle_sha256=LOCK['bundle_sha256'])


def _real_cmd(w: TranscriptWriter, exit_code: int = 0) -> None:
    w.append(
        'command',
        TS,
        cmd='true',
        cwd='.',
        exit_code=exit_code,
        stdout_sha256='0' * 64,
        stderr_sha256='0' * 64,
        evidence='real',
        item='t',
    )


def _artifact(w: TranscriptWriter) -> None:
    w.append('artifact', TS, path='r.json', sha256='0' * 64, bytes=1)


def build_good(tmp: Path) -> Path:
    w = _writer(tmp)
    _run_start(w)
    _real_cmd(w)
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
    _artifact(w)
    w.append('verdict', TS, result='PASS', backed_by=[t['seq']], score_ratio=1.0)
    return w.path


def build_hidden_failed(tmp: Path) -> Path:
    w = _writer(tmp)
    _run_start(w)
    _real_cmd(w, exit_code=0)
    good = w.append(
        'test',
        TS,
        name='t01',
        passed=1,
        failed=0,
        skipped=0,
        evidence='real',
        critical=True,
    )
    _real_cmd(w, exit_code=1)
    w.append(
        'test',
        TS,
        name='t06',
        passed=0,
        failed=1,
        skipped=0,
        evidence='real',
        critical=True,
    )
    _artifact(w)
    # PASS verdict despite a failed item -> must be rejected.
    w.append('verdict', TS, result='PASS', backed_by=[good['seq']], score_ratio=1.0)
    return w.path


def build_fabricated_pass(tmp: Path) -> Path:
    w = _writer(tmp)
    _run_start(w)
    _real_cmd(w)
    # Only a PRESENCE test exists; a PASS cannot rest on presence evidence.
    pres = w.append(
        'test',
        TS,
        name='t08',
        passed=0,
        failed=0,
        skipped=1,
        evidence='presence',
        critical=False,
    )
    _artifact(w)
    w.append('verdict', TS, result='PASS', backed_by=[pres['seq']], score_ratio=1.0)
    return w.path


def _assert_fails(path: Path, needle: str, **kw) -> None:
    errs = validate(path, LOCK, BASE_SHA, **kw)
    joined = ' | '.join(errs)
    assert errs, f'expected FAIL but validator passed: {path}'
    assert needle in joined, f'expected error containing {needle!r}, got: {joined}'


def test_good_passes():
    with tempfile.TemporaryDirectory() as d:
        assert (
            validate(
                build_good(Path(d)),
                LOCK,
                BASE_SHA,
                require_head=HEAD,
                require_pass=True,
            )
            == []
        )


def test_missing_transcript_fails():
    _assert_fails(Path('/nonexistent/transcript.jsonl'), 'transcript missing')


def test_stale_head_fails():
    with tempfile.TemporaryDirectory() as d:
        _assert_fails(build_good(Path(d)), 'stale head', require_head='b' * 40)


def test_stale_base_fails():
    with tempfile.TemporaryDirectory() as d:
        w = _writer(Path(d))
        _run_start(w, base='dead' * 10)
        _real_cmd(w)
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
        _artifact(w)
        w.append('verdict', TS, result='PASS', backed_by=[t['seq']], score_ratio=1.0)
        _assert_fails(w.path, 'drift: base_sha')


def test_hidden_failed_item_fails():
    with tempfile.TemporaryDirectory() as d:
        _assert_fails(build_hidden_failed(Path(d)), 'hidden failed item')


def test_fabricated_pass_fails():
    with tempfile.TemporaryDirectory() as d:
        _assert_fails(build_fabricated_pass(Path(d)), 'fabricated PASS')


def test_not_verified_under_require_pass_fails():
    with tempfile.TemporaryDirectory() as d:
        w = _writer(Path(d))
        _run_start(w)
        _real_cmd(w)
        w.append(
            'test',
            TS,
            name='t08',
            passed=0,
            failed=0,
            skipped=1,
            evidence='presence',
            critical=False,
        )
        _artifact(w)
        w.append('verdict', TS, result='NOT_VERIFIED', backed_by=[], score_ratio=0.0)
        _assert_fails(w.path, 'required PASS', require_pass=True)


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
        print(f'transcript-gate red-fixtures: {failed} FAILURE(S)')
        return 1
    print(f'transcript-gate red-fixtures: ALL {len(tests)} PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
