#!/usr/bin/env python3
"""Deterministic acceptance/benchmark harness — identical across experiment lanes.

Runs the shared rubric (rubric.json, frozen in contract.lock.json) against what
the current lane actually implements and writes machine-readable results.

Hardening (no false confidence):
  * Every SCORED item is bound to a REAL command: its argv, real exit code, and
    stdout/stderr sha256 are recorded so evidence is replayable, not asserted.
  * Presence/echo checks are CONTRACT EVIDENCE ONLY (evidence="presence"): they
    are reported NOT_VERIFIED and NEVER counted as benchmark success. Real
    provider selection, live self-heal recovery, real session resume, and true
    fresh-context skill loading need the running app / a provider secret and are
    therefore NOT_VERIFIED here rather than claimed.
  * The benchmark score counts ONLY real items (passed_real / total_real).
  * Exit code is NON-ZERO if any CRITICAL real item is not PASS (fail-closed);
    the producer/CI turn that into a NOT_VERIFIED verdict.
  * Credential-safe: secret VALUES are never printed; live items are NOT_VERIFIED
    unless a secret is present.

Status values: PASS, FAIL, MISSING (not implemented), NOT_VERIFIED (presence-only
or needs a secret/live run — excluded from the benchmark ratio).

Usage:
  python3 experiments/harness/run_acceptance.py --lane <name> \
      [--out experiments/lanes/<name>/results-<name>.json]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
QA = REPO / 'quantum-agent'
SKILLS = REPO / '.agents' / 'skills'
LIVE_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
_HARNESS_TEMP = tempfile.TemporaryDirectory(prefix='openhands-harness-')
HARNESS_TEMP = Path(_HARNESS_TEMP.name)

# Evidence policy — IDENTICAL across all lanes (part of the shared harness).
#   real:     a runnable command whose exit/output is scored (benchmark).
#   presence: a structural/mock check — contract evidence only, NEVER benchmark
#             success (needs the running app / a fresh agent context / a live
#             session to be real; reported NOT_VERIFIED).
#   live:     needs a provider secret; NOT_VERIFIED unless present.
# critical:   must be PASS for local acceptance (100% required for superiority).
EVIDENCE = {
    't01-cli-help': ('real', True),
    't02-provider-list': ('real', True),
    't03-provider-status': ('real', True),
    't04-provider-test-diagnostic': ('real', True),
    't05-provider-switch': ('real', True),
    't06-invalid-runtime-errors': ('real', True),
    't07-skill-validate': ('real', True),
    't08-skill-forward-1': ('presence', False),
    't09-skill-forward-2': ('presence', False),
    't10-self-heal-recovery': ('presence', False),
    't11-verify-contract': ('real', True),
    't12-doctor-report': ('real', True),
    't13-resume': ('presence', False),
    't14-live-provider-call': ('live', False),
}


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8', 'replace')).hexdigest()


def sh(
    cmd: list[str], cwd: Path | None = None, env: dict | None = None, timeout: int = 180
):
    """Run a command; return (rc, stdout, stderr, ms). rc=127 on exec error."""
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
        return p.returncode, (p.stdout or ''), (p.stderr or ''), ms
    except Exception as e:  # noqa: BLE001 — record as an exec failure, never crash
        return 127, '', f'[harness-exec-error] {e}', int((time.time() - t0) * 1000)


def quantum_argv(sub: list[str]) -> list[str]:
    # Prefer a pnpm already on PATH (CI installs it); fall back to corepack.
    pnpm = shutil.which('pnpm')
    corepack = shutil.which('corepack')
    base = [pnpm] if pnpm else [corepack or 'corepack', 'pnpm']
    return [*base, 'quantum', *sub]


def wsl_path(path: Path) -> str:
    resolved = path.resolve()
    if os.name == 'nt' and len(resolved.drive) == 2:
        return f'/mnt/{resolved.drive[0].lower()}{resolved.as_posix()[2:]}'
    return resolved.as_posix()


def portable_text(value: str) -> str:
    home = Path.home()
    homes = {str(home), home.as_posix(), wsl_path(home)}
    for candidate in sorted(homes, key=len, reverse=True):
        value = value.replace(candidate, '$USER_HOME')
    return value


def portable_command(argv: list[str]) -> str:
    normalized = list(argv)
    if normalized and Path(normalized[0]).is_absolute():
        normalized[0] = Path(normalized[0]).name
    return shlex.join(portable_text(arg) for arg in normalized)


def doctor_e2e_argv(script: Path) -> list[str] | None:
    if os.name != 'nt':
        return [shutil.which('bash') or 'bash', script.as_posix()]

    # Git for Windows lacks the POSIX process-group primitives managed by this
    # Linux control surface. Exercise the real contract through installed WSL.
    wsl = shutil.which('wsl.exe')
    if wsl is None:
        return None

    dot_git = REPO / '.git'
    git_dir = dot_git
    if dot_git.is_file():
        marker = 'gitdir:'
        value = dot_git.read_text(encoding='utf-8').strip()
        if not value.lower().startswith(marker):
            return None
        git_dir = Path(value[len(marker) :].strip())
        if not git_dir.is_absolute():
            git_dir = (REPO / git_dir).resolve()

    repo = shlex.quote(wsl_path(REPO))
    git_dir_arg = shlex.quote(wsl_path(git_dir))
    command = (
        'set -euo pipefail; '
        f'export GIT_DIR={git_dir_arg}; '
        f'export GIT_WORK_TREE={repo}; '
        f'cd {repo}; '
        'bash scripts/test-openhands-cloud.sh'
    )
    return [wsl, '--exec', 'bash', '-lc', command]


def has_quantum() -> bool:
    return (QA / 'package.json').exists()


class Result:
    """A single scored item bound to a real command artifact (when real)."""

    def __init__(self, tid: str):
        ev, crit = EVIDENCE.get(tid, ('real', True))
        self.id = tid
        self.evidence = ev
        self.critical = crit
        self.status = 'MISSING'
        self.retries = 0
        self.note = ''
        self.cmd: str | None = None
        self.cwd: str | None = None
        self.exit_code: int | None = None
        self.stdout_sha256: str | None = None
        self.stderr_sha256: str | None = None
        self.stdout_excerpt: str | None = None
        self.latency_ms = 0

    def bind(self, argv: list[str], cwd: Path, rc: int, out: str, err: str, ms: int):
        self.cmd = portable_command(argv)
        self.cwd = str(cwd.relative_to(REPO)) if cwd != REPO else '.'
        self.exit_code = rc
        self.stdout_sha256 = sha256_hex(out)
        self.stderr_sha256 = sha256_hex(err)
        self.stdout_excerpt = portable_text((out or err)[-600:])
        self.latency_ms = ms

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'evidence': self.evidence,
            'critical': self.critical,
            'status': self.status,
            'latency_ms': self.latency_ms,
            'retries': self.retries,
            'note': self.note,
            'cmd': self.cmd,
            'cwd': self.cwd,
            'exit_code': self.exit_code,
            'stdout_sha256': self.stdout_sha256,
            'stderr_sha256': self.stderr_sha256,
            'stdout_excerpt': self.stdout_excerpt,
        }


def real_probe(
    tid: str,
    argv: list[str],
    cwd: Path,
    ok: 're.Pattern[str] | Callable[[str], bool]',
    *,
    expect_nonzero: bool = False,
    env: dict | None = None,
    timeout: int = 180,
) -> Result:
    """Run a real command and score it PASS iff exit expectation + output match.

    The RAW exit code and stdout/stderr hashes are always recorded (replayable).
    `expect_nonzero` marks items where a non-zero exit is the *desired* behavior
    (e.g. rejecting an invalid runtime); scoring keys off this expectation, not a
    blanket exit==0 rule.
    """
    r = Result(tid)
    rc, out, err, ms = sh(argv, cwd=cwd, env=env, timeout=timeout)
    r.bind(argv, cwd, rc, out, err, ms)
    combined = out + err
    exit_ok = (rc != 0) if expect_nonzero else (rc == 0)
    if isinstance(ok, re.Pattern):
        content_ok = bool(ok.search(combined))
    else:
        content_ok = bool(ok(combined))
    r.status = 'PASS' if (exit_ok and content_ok) else 'FAIL'
    r.note = f'exit={rc} expect_nonzero={expect_nonzero} content_ok={content_ok}'
    return r


def _missing(tid: str, note: str) -> Result:
    r = Result(tid)
    r.status = 'MISSING'
    r.note = note
    return r


def presence_probe(tid: str, present: bool, note: str, retries: int = 0) -> Result:
    """A structural/mock check: contract evidence only, reported NOT_VERIFIED.

    `present` records whether the structural artifact exists (contract evidence);
    either way the benchmark status is NOT_VERIFIED — a presence check is never
    counted as real success.
    """
    r = Result(tid)
    r.retries = retries
    r.status = 'NOT_VERIFIED'
    r.note = (
        f'presence={present}; {note} (contract-only; real run needs app/live session)'
    )
    return r


# ---------------------------------------------------------------- real probes


def probe_real(tid: str) -> Result:  # noqa: C901 — explicit per-item mapping
    q = has_quantum()
    if tid == 't01-cli-help':
        if not q:
            alt = REPO / 'scripts' / 'openhands-cloud'
            if alt.exists():
                return real_probe(
                    tid,
                    ['bash', str(alt), 'help'],
                    REPO,
                    re.compile(r'openhands-cloud', re.I),
                )
            return _missing(tid, 'no agent CLI')
        return real_probe(
            tid, quantum_argv(['--help']), QA, re.compile(r'provider|doctor', re.I)
        )
    if tid == 't02-provider-list':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(
            tid,
            quantum_argv(['provider', 'list']),
            QA,
            lambda o: ('claude' in o.lower())
            and ('secret' in o.lower() or 'OPENAI' in o),
        )
    if tid == 't03-provider-status':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(
            tid,
            quantum_argv(['provider', 'status']),
            QA,
            lambda o: 'runtime' in o.lower() and 'model' in o.lower(),
        )
    if tid == 't04-provider-test-diagnostic':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(
            tid,
            quantum_argv(['provider', 'test']),
            QA,
            lambda o: any(w in o.lower() for w in ('contract', 'ready', 'diagnostic'))
            or any(s in o for s in LIVE_SECRETS),
        )
    if tid == 't05-provider-switch':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(
            tid,
            quantum_argv(['provider', 'status']),
            QA,
            re.compile(r'codex', re.I),
            env={
                'QUANTUM_RUNTIME': 'codex',
                'QUANTUM_HOME': str(HARNESS_TEMP / 'provider-switch'),
            },
        )
    if tid == 't06-invalid-runtime-errors':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(
            tid,
            quantum_argv(['provider', 'status']),
            QA,
            re.compile(r'invalid|allowed|runtime', re.I),
            expect_nonzero=True,
            env={
                'QUANTUM_RUNTIME': 'gemini-bogus',
                'QUANTUM_HOME': str(HARNESS_TEMP / 'invalid-runtime'),
            },
        )
    if tid == 't07-skill-validate':
        return real_probe(
            tid,
            [sys.executable, 'experiments/harness/skill_lint.py'],
            REPO,
            re.compile(r'OK \(\d+ skills valid\)'),
        )
    if tid == 't11-verify-contract':
        if not q:
            return _missing(tid, 'no quantum CLI')
        return real_probe(tid, quantum_argv(['verify']), QA, re.compile(r'unknown=0'))
    if tid == 't12-doctor-report':
        script = REPO / 'scripts' / 'test-openhands-cloud.sh'
        if not script.exists():
            return _missing(tid, 'no doctor E2E')
        argv = doctor_e2e_argv(script)
        if argv is None:
            return _missing(
                tid, 'Windows doctor E2E requires an installed WSL distribution'
            )
        return real_probe(
            tid,
            argv,
            REPO,
            re.compile(r'ALL PASS'),
        )
    return _missing(tid, 'no real probe')


def probe_presence(tid: str) -> Result:
    if tid in ('t08-skill-forward-1', 't09-skill-forward-2'):
        name = 'self-heal' if tid.endswith('1') else 'skill-new'
        found = any(
            (root / name / 'SKILL.md').exists() for root in (SKILLS, QA / 'skills-core')
        )
        return presence_probe(
            tid, found, f'{name} discoverable by file (not a fresh agent context)'
        )
    if tid == 't10-self-heal-recovery':
        doctor = REPO / 'scripts' / 'openhands-cloud'
        found = doctor.exists() and 'REPAIRED' in doctor.read_text(encoding='utf-8')
        return presence_probe(
            tid,
            found,
            'bounded repair path present (not a live injected-failure recovery)',
            retries=1,
        )
    if tid == 't13-resume':
        found = has_quantum()
        return presence_probe(
            tid,
            found,
            'resume flag handled on mock transport (not a real session resume)',
        )
    return presence_probe(tid, False, 'no presence probe')


def probe_live(tid: str) -> Result:
    have = [s for s in LIVE_SECRETS if os.environ.get(s)]
    if not have:
        r = Result(tid)
        r.status = 'NOT_VERIFIED'
        r.note = f'needs one of: {", ".join(LIVE_SECRETS)} (no billable run)'
        return r
    if not has_quantum():
        return _missing(tid, 'no quantum CLI')
    return real_probe(
        tid,
        quantum_argv(['run', 'reply with the single word: pong']),
        QA,
        re.compile(r'pong', re.I),
        timeout=180,
    )


def score(tid: str) -> Result:
    ev = EVIDENCE.get(tid, ('real', True))[0]
    if ev == 'real':
        return probe_real(tid)
    if ev == 'presence':
        return probe_presence(tid)
    return probe_live(tid)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--lane', required=True)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    rubric = json.loads((Path(__file__).parent / 'rubric.json').read_text())
    results = [score(t['id']).to_dict() for t in rubric['tasks']]
    by_id = {r['id']: r for r in results}
    for t in rubric['tasks']:
        by_id[t['id']]['category'] = t['category']

    real = [r for r in results if r['evidence'] == 'real']
    real_pass = [r for r in real if r['status'] == 'PASS']
    critical = [r for r in results if r['critical']]
    critical_pass = [r for r in critical if r['status'] == 'PASS']
    presence = [r['id'] for r in results if r['evidence'] == 'presence']
    not_verified = [r['id'] for r in results if r['status'] == 'NOT_VERIFIED']
    critical_ok = len(critical_pass) == len(critical)

    summary = {
        'lane': args.lane,
        'rubric_version': rubric['rubric_version'],
        'head_sha': sh(['git', 'rev-parse', 'HEAD'])[1].strip(),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'benchmark_total': len(real),
        'benchmark_pass': len(real_pass),
        'score_ratio': round(len(real_pass) / len(real), 3) if real else 0.0,
        'critical_total': len(critical),
        'critical_pass': len(critical_pass),
        'critical_ok': critical_ok,
        'presence_contract_only': presence,
        'not_verified': not_verified,
        'total_latency_ms': sum(r['latency_ms'] for r in results),
        'total_retries': sum(r['retries'] for r in results),
        'cost_tokens': 'NOT_VERIFIED (no provider secret / no billable run)',
    }
    out = {'summary': summary, 'results': results}
    print(json.dumps(summary, indent=2))
    for r in results:
        mark = '*' if r['critical'] else ' '
        print(
            f'  {r["status"]:12}{mark} {r["id"]:30} {r["evidence"]:8} {r["latency_ms"]:6}ms  {r["note"]}'
        )
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(out, indent=2) + '\n')
        print(f'\nwrote {args.out}')

    # Fail-closed: a critical real item that is not PASS makes the harness fail.
    if not critical_ok:
        failed = [r['id'] for r in critical if r['status'] != 'PASS']
        print(f'\nCRITICAL NOT PASS: {failed} -> acceptance FAILED (fail-closed)')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
