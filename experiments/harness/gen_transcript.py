#!/usr/bin/env python3
"""Generate a conformant, tamper-evident transcript for the current lane.

Records a real acceptance-harness run as an append-only JSONL transcript with a
hash chain, then you validate it with validate_transcript.py. This is the
reference producer lanes use so their evidence is schema-valid and replayable.

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
    )

    summary = json.loads(results_path.read_text())['summary']
    w.append(
        'artifact',
        now(),
        path=str(results_path.relative_to(REPO)),
        sha256=sha256_file(results_path),
        bytes=results_path.stat().st_size,
    )
    scored = summary['scored_tasks']
    passed = summary['passed']
    w.append(
        'test',
        now(),
        name='acceptance-rubric',
        passed=passed,
        failed=scored - passed,
        skipped=len(summary.get('not_verified', [])),
    )

    cmd_seq = 4  # run_start(1), contract_ack(2), message(3), command(4)
    test_seq = 6  # artifact(5), test(6)
    w.append(
        'verdict',
        now(),
        result='PASS' if p.returncode == 0 else 'FAIL',
        score_ratio=summary['score_ratio'],
        backed_by=[cmd_seq, test_seq],
        note=f'harness completed; rubric score {summary["score_ratio"]} (cost/tokens NOT_VERIFIED without provider secret)',
    )

    print(f'wrote {tpath} ({tpath.stat().st_size} bytes)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
