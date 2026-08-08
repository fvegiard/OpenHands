#!/usr/bin/env python3
"""Deterministic acceptance/benchmark harness — identical across experiment lanes.

Runs the shared rubric (rubric.json) against whatever the current lane actually
implements and writes machine-readable results. It is:

  * deterministic and non-destructive (no writes to tracked files, no app start);
  * credential-safe (live-provider tasks are NOT_VERIFIED unless a secret exists;
    secret VALUES are never printed);
  * lane-agnostic (capability-detected: a task the lane has not implemented scores
    MISSING rather than crashing).

Status values: PASS (1), FAIL (0), MISSING (0, not implemented), NOT_VERIFIED
(excluded from the ratio, needs a secret/live run).

Usage:
  python3 experiments/harness/run_acceptance.py --lane <name> \
      [--out experiments/harness/results-<name>.json]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
QA = REPO / 'quantum-agent'
SKILLS = REPO / '.agents' / 'skills'
LIVE_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']


def sh(
    cmd: list[str], cwd: Path | None = None, env: dict | None = None, timeout: int = 120
):
    t0 = time.time()
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd or REPO),
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, **(env or {})},
        )
        ms = int((time.time() - t0) * 1000)
        return p.returncode, (p.stdout or '') + (p.stderr or ''), ms
    except Exception as e:
        return 127, f'[harness-exec-error] {e}', int((time.time() - t0) * 1000)


def quantum(args: list[str], env: dict | None = None, timeout: int = 120):
    """Invoke the lane's quantum CLI if present."""
    if not (QA / 'package.json').exists():
        return None
    return sh(['corepack', 'pnpm', 'quantum', *args], cwd=QA, env=env, timeout=timeout)


def has_quantum() -> bool:
    return (QA / 'package.json').exists()


# --------------------------------------------------------------------- probes
# Each probe returns (status, retries, note). latency is measured by the caller.


def p_cli_help():
    r = quantum(['--help'])
    if r is None:
        alt = REPO / 'scripts' / 'openhands-cloud'
        if alt.exists():
            rc, out, _ = sh(['bash', str(alt), 'help'])
            return (
                ('PASS' if rc == 0 and 'openhands-cloud' in out else 'FAIL'),
                0,
                'openhands-cloud help',
            )
        return 'MISSING', 0, 'no agent CLI'
    rc, out, _ = r
    return (
        ('PASS' if rc == 0 and 'provider' in out or 'doctor' in out else 'FAIL'),
        0,
        'quantum --help',
    )


def _provider(args, env=None):
    return quantum(['provider', *args], env=env)


def p_provider_list():
    r = _provider(['list'])
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    ok = rc == 0 and ('claude' in out) and ('secret' in out.lower() or 'OPENAI' in out)
    return (
        ('PASS' if ok else ('MISSING' if 'unknown command' in out else 'FAIL')),
        0,
        'runtimes+pkg/secret listed',
    )


def p_provider_status():
    r = _provider(['status'])
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    return (
        (
            'PASS'
            if rc == 0 and 'runtime' in out.lower() and 'model' in out.lower()
            else ('MISSING' if 'unknown command' in out else 'FAIL')
        ),
        0,
        'status shows runtime/model',
    )


def p_provider_test():
    r = _provider(['test'])
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    # A precise diagnostic (contract or live) is required; no silent fallback.
    ok = (
        'contract' in out.lower()
        or 'ready' in out.lower()
        or 'diagnostic' in out.lower()
        or any(s in out for s in LIVE_SECRETS)
    )
    return (
        ('PASS' if ok else ('MISSING' if 'unknown command' in out else 'FAIL')),
        0,
        'precise diagnostic',
    )


def p_provider_switch():
    base = _provider(['status'])
    if base is None:
        return 'MISSING', 0, 'no quantum CLI'
    r = _provider(
        ['status'],
        env={'QUANTUM_RUNTIME': 'codex', 'QUANTUM_HOME': '/tmp/exp-harness-qh'},
    )
    rc, out, _ = r
    return (
        (
            'PASS'
            if rc == 0 and 'codex' in out
            else ('MISSING' if 'unknown command' in out else 'FAIL')
        ),
        0,
        'env switch -> codex',
    )


def p_invalid_runtime():
    r = _provider(
        ['status'],
        env={'QUANTUM_RUNTIME': 'gemini-bogus', 'QUANTUM_HOME': '/tmp/exp-harness-qh2'},
    )
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    if 'unknown command' in out or 'unknown option' in out:
        return 'MISSING', 0, 'provider command not implemented'
    # Implemented: must reject with a precise error, not silently fall back.
    ok = (
        'invalid' in out.lower()
        or 'allowed' in out.lower()
        or (rc != 0 and 'runtime' in out.lower())
    )
    return ('PASS' if ok else 'FAIL'), 0, 'invalid id -> precise error'


def _validate_skill(md: Path) -> bool:
    text = md.read_text(encoding='utf-8')
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        return False
    fm = m.group(1)
    name = re.search(r'^name:\s*(.+)$', fm, re.M)
    desc = re.search(r'^description:\s*(.+)$', fm, re.M)
    if not name or not desc:
        return False
    return bool(re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', name.group(1).strip()))


def p_skill_validate():
    if not SKILLS.is_dir():
        return 'MISSING', 0, 'no .agents/skills'
    mds = list(SKILLS.glob('*/SKILL.md'))
    if not mds:
        return 'MISSING', 0, 'no skills'
    bad = [str(m.relative_to(REPO)) for m in mds if not _validate_skill(m)]
    return ('PASS' if not bad else 'FAIL'), 0, f'{len(mds)} skills; bad={bad}'


def p_skill_forward(name: str):
    # Fresh-context discoverability: the skill file resolves by name and loads.
    for root in [SKILLS, QA / 'skills-core']:
        cand = root / name / 'SKILL.md'
        if cand.exists() and _validate_skill(cand):
            return 'PASS', 0, f'{name} discoverable at {cand.relative_to(REPO)}'
    return 'MISSING', 0, f'{name} not found'


def p_self_heal():
    # Bounded self-heal capability present (doctor repair+rerun or self-heal skill).
    doctor = REPO / 'scripts' / 'openhands-cloud'
    if doctor.exists() and 'REPAIRED' in doctor.read_text(encoding='utf-8'):
        return 'PASS', 1, 'doctor bounded repair+rerun (1 retry)'
    if (SKILLS / 'self-heal' / 'SKILL.md').exists() or (
        QA / 'skills-core' / 'self-heal' / 'SKILL.md'
    ).exists():
        return 'PASS', 1, 'self-heal skill present'
    return 'MISSING', 0, 'no bounded self-heal'


def p_verify_contract():
    r = quantum(['verify'])
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    return (
        ('PASS' if rc == 0 and 'unknown=0' in out else 'FAIL'),
        0,
        'README contract verify',
    )


def p_doctor_report():
    doctor = REPO / 'scripts' / 'openhands-cloud'
    if not doctor.exists():
        return 'MISSING', 0, 'no doctor'
    txt = doctor.read_text(encoding='utf-8')
    ok = ('OHC_REPORT' in txt or 'generated_at' in txt) and 'doctor' in txt
    return ('PASS' if ok else 'FAIL'), 0, 'machine-readable report supported'


def p_resume():
    # Deterministic resume-id handling: quantum chat/run accept --resume.
    r = quantum(['chat', '--resume', 'last'], timeout=60)
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    return ('PASS' if rc == 0 else 'FAIL'), 0, 'resume id handled (mock transport)'


def p_live_provider():
    have = [s for s in LIVE_SECRETS if os.environ.get(s)]
    if not have:
        return 'NOT_VERIFIED', 0, f'needs one of: {", ".join(LIVE_SECRETS)}'
    r = quantum(['run', 'reply with the single word: pong'], timeout=120)
    if r is None:
        return 'MISSING', 0, 'no quantum CLI'
    rc, out, _ = r
    return ('PASS' if rc == 0 else 'FAIL'), 0, 'live billable call'


PROBES = {
    't01-cli-help': p_cli_help,
    't02-provider-list': p_provider_list,
    't03-provider-status': p_provider_status,
    't04-provider-test-diagnostic': p_provider_test,
    't05-provider-switch': p_provider_switch,
    't06-invalid-runtime-errors': p_invalid_runtime,
    't07-skill-validate': p_skill_validate,
    't08-skill-forward-1': lambda: p_skill_forward('self-heal'),
    't09-skill-forward-2': lambda: p_skill_forward('skill-new'),
    't10-self-heal-recovery': p_self_heal,
    't11-verify-contract': p_verify_contract,
    't12-doctor-report': p_doctor_report,
    't13-resume': p_resume,
    't14-live-provider-call': p_live_provider,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lane', required=True)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    rubric = json.loads((Path(__file__).parent / 'rubric.json').read_text())
    results = []
    for task in rubric['tasks']:
        tid = task['id']
        probe = PROBES.get(tid)
        t0 = time.time()
        if probe is None:
            status, retries, note = 'MISSING', 0, 'no probe'
        else:
            status, retries, note = probe()
        ms = int((time.time() - t0) * 1000)
        results.append(
            {
                'id': tid,
                'category': task['category'],
                'status': status,
                'latency_ms': ms,
                'retries': retries,
                'note': note,
            }
        )

    scored = [r for r in results if r['status'] != 'NOT_VERIFIED']
    passed = sum(1 for r in scored if r['status'] == 'PASS')
    summary = {
        'lane': args.lane,
        'rubric_version': rubric['rubric_version'],
        'head_sha': sh(['git', 'rev-parse', 'HEAD'])[1].strip(),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'scored_tasks': len(scored),
        'passed': passed,
        'score_ratio': round(passed / len(scored), 3) if scored else 0.0,
        'not_verified': [r['id'] for r in results if r['status'] == 'NOT_VERIFIED'],
        'total_latency_ms': sum(r['latency_ms'] for r in results),
        'total_retries': sum(r['retries'] for r in results),
        'cost_tokens': 'NOT_VERIFIED (no provider secret / no billable run)',
    }
    out = {'summary': summary, 'results': results}
    print(json.dumps(summary, indent=2))
    for r in results:
        print(f'  {r["status"]:12} {r["id"]:30} {r["latency_ms"]:6}ms  {r["note"]}')
    if args.out:
        Path(args.out).write_text(json.dumps(out, indent=2) + '\n')
        print(f'\nwrote {args.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
