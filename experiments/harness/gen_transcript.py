#!/usr/bin/env python3
"""Generate a conformant, tamper-evident transcript for the current lane.

Runs the shared acceptance harness (run_acceptance.py) and then binds EVERY
scored item to a real command + test event with exit/stdout/stderr hashes, so the
transcript is replayable and cannot claim success it did not earn:

  * each real item -> a `command` event (raw argv/exit/stdout+stderr sha256) and a
    `test` event (evidence="real", passed/failed) ;
  * each presence item -> a skipped `test` (evidence="presence") — contract
    evidence only, never counted as benchmark success ;
  * each real FAIL -> an append-only `failure` event ;
  * verdict is PASS only if ALL critical items are real PASS with no failures;
    otherwise NOT_VERIFIED (never a fabricated PASS).

Usage:
  python3 experiments/harness/gen_transcript.py --lane <lane> \
      --agent <agent> --model <model> --runtime <runtime>
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from transcript_lib import TranscriptWriter, sha256_file, sha256_hex  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
BASE_SHA = '1f43ce8112653f1f05e5b6bf0caf1534beb6114d'


def now() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def git(*args) -> str:
    return subprocess.run(
        ['git', *args], cwd=str(REPO), capture_output=True, text=True
    ).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lane', required=True)
    ap.add_argument('--agent', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--runtime', required=True)
    args = ap.parse_args()

    lock = json.loads((REPO / 'experiments' / 'contract.lock.json').read_text())
    lane_dir = REPO / 'experiments' / 'lanes' / args.lane
    lane_dir.mkdir(parents=True, exist_ok=True)
    tpath = lane_dir / 'transcript.jsonl'
    if tpath.exists():
        tpath.unlink()  # fresh isolated run
    w = TranscriptWriter(tpath)

    w.append(
        'run_start',
        now(),
        agent=args.agent,
        model=args.model,
        runtime=args.runtime,
        branch=git('rev-parse', '--abbrev-ref', 'HEAD'),
        base_sha=BASE_SHA,
        head_sha=git('rev-parse', 'HEAD'),
        contract_bundle_sha256=lock['bundle_sha256'],
        rubric_sha256=lock['files']['harness/rubric.json'],
    )
    w.append('contract_ack', now(), contract_bundle_sha256=lock['bundle_sha256'])
    w.append(
        'message',
        now(),
        role='agent',
        text=f'Acknowledged contract bundle {lock["bundle_sha256"][:12]}; running acceptance harness for lane {args.lane}.',
    )

    # Run the shared harness (fail-closed: non-zero exit if any critical item is
    # not PASS). Record the aggregate run as a replayable command event too.
    results_path = lane_dir / f'results-{args.lane}.json'
    cmd = [
        'python3',
        'experiments/harness/run_acceptance.py',
        '--lane',
        args.lane,
        '--out',
        str(results_path.relative_to(REPO)),
    ]
    p = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True)
    w.append(
        'command',
        now(),
        cmd=' '.join(cmd),
        cwd='.',
        exit_code=p.returncode,
        stdout_sha256=sha256_hex(p.stdout.encode()),
        stderr_sha256=sha256_hex(p.stderr.encode()),
        stdout_excerpt=p.stdout[-800:],
        evidence='real',
        item='acceptance-aggregate',
    )

    data = json.loads(results_path.read_text())
    summary = data['summary']
    results = data['results']

    w.append(
        'artifact',
        now(),
        path=str(results_path.relative_to(REPO)),
        sha256=sha256_file(results_path),
        bytes=results_path.stat().st_size,
    )

    # Bind every scored item to its real command + test event; append a failure
    # event for any real FAIL. Track the real passing test seqs for backing.
    real_pass_test_seqs: list[int] = []
    for r in results:
        tid = r['id']
        ev = r['evidence']
        status = r['status']
        if ev == 'real' and r.get('cmd') is not None:
            w.append(
                'command',
                now(),
                cmd=r['cmd'],
                cwd=r.get('cwd') or '.',
                exit_code=int(r['exit_code']),
                stdout_sha256=r['stdout_sha256'],
                stderr_sha256=r['stderr_sha256'],
                stdout_excerpt=r.get('stdout_excerpt') or '',
                evidence='real',
                item=tid,
            )
            t = w.append(
                'test',
                now(),
                name=tid,
                passed=1 if status == 'PASS' else 0,
                failed=1 if status == 'FAIL' else 0,
                skipped=0,
                evidence='real',
                critical=bool(r['critical']),
            )
            if status == 'PASS':
                real_pass_test_seqs.append(t['seq'])
            elif status == 'FAIL':
                w.append(
                    'failure',
                    now(),
                    where=tid,
                    detail=f'real item FAIL: {r.get("note", "")}',
                )
        else:
            # presence / live / missing -> NOT counted as benchmark success.
            w.append(
                'test',
                now(),
                name=tid,
                passed=0,
                failed=0,
                skipped=1,
                evidence=ev,
                critical=bool(r['critical']),
                note=r.get('note', ''),
            )

    critical_ok = bool(summary.get('critical_ok'))
    any_real_fail = any(
        r['evidence'] == 'real' and r['status'] == 'FAIL' for r in results
    )
    verified = critical_ok and not any_real_fail and p.returncode == 0
    result = 'PASS' if verified else 'NOT_VERIFIED'
    note = (
        f'critical {summary.get("critical_pass")}/{summary.get("critical_total")} '
        f'PASS; benchmark score {summary.get("score_ratio")} over '
        f'{summary.get("benchmark_total")} real items; '
        f'presence-only NOT_VERIFIED={summary.get("presence_contract_only")}; '
        f'live/cost NOT_VERIFIED (no provider secret).'
    )
    if not verified:
        note = 'NOT VERIFIED — ' + note
    w.append(
        'verdict',
        now(),
        result=result,
        score_ratio=summary['score_ratio'],
        backed_by=real_pass_test_seqs,
        note=note,
    )

    print(f'wrote {tpath} ({tpath.stat().st_size} bytes); verdict={result}')
    return (
        0 if result == 'PASS' else 0
    )  # producer always exits 0; verdict carries the state


if __name__ == '__main__':
    raise SystemExit(main())
