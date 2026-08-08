#!/usr/bin/env python3
"""Deterministic repository-isolation gate.

Fails (exit 1) if repository isolation for fvegiard/OpenHands is violated:

  1. Any git remote has a *push* URL pointing at the canonical upstream
     (All-Hands-AI/OpenHands or OpenHands/OpenHands) — i.e. a writable upstream.
  2. Any GitHub Actions workflow performs an automatic upstream sync or an
     automatic push to main (merge/rebase from upstream, or `git push ... main`).

Read-only upstream usage is allowed: an upstream remote may exist for
comparison as long as its push URL is disabled (see DISABLED_PUSH sentinel), and
workflows may reference the official repo inside `if: github.repository == ...`
guards. This check is intentionally narrow so it only trips on real regressions.

Usage: python3 scripts/check-repo-isolation.py [--repo-root .]
Exit 0 = isolated; exit 1 = violation(s) found.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# Canonical upstream repo (both the historical All-Hands-AI org and the current
# OpenHands org). Matches ".../OpenHands" or ".../OpenHands.git" exactly, so it
# does NOT match sibling repos like OpenHands/OpenHands-Cloud or saas-deploy.
UPSTREAM_RE = re.compile(
    r'github\.com[:/](?:All-Hands-AI|OpenHands)/OpenHands(?:\.git)?/?$',
    re.IGNORECASE,
)

# Intentionally-disabled push sentinel (a retained read-only upstream must use
# this so a push can never reach the official repo).
DISABLED_PUSH = 'DISABLED'

# Dangerous workflow operations: automatic upstream sync or push-to-main.
# The push pattern is intentionally broad (any `git push ... main ...`) so
# refspec variations like `HEAD:refs/heads/main` cannot slip through.
DANGER_PATTERNS = [
    re.compile(r'git\s+merge\s+upstream', re.IGNORECASE),
    re.compile(r'git\s+rebase\s+upstream', re.IGNORECASE),
    re.compile(r'git\s+pull\s+upstream', re.IGNORECASE),
    re.compile(r'git\s+push\b[^\n]*\bmain\b', re.IGNORECASE),
]


def check_remotes(violations: list[str]) -> None:
    try:
        out = subprocess.run(
            ['git', 'remote', '-v'],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except Exception as e:  # pragma: no cover - git always present in CI
        violations.append(f'could not read git remotes: {e}')
        return
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        name, url, kind = parts[0], parts[1], parts[2]
        if kind != '(push)':
            continue
        # A disabled sentinel push URL is fine (read-only upstream).
        if DISABLED_PUSH in url:
            continue
        if UPSTREAM_RE.search(url):
            violations.append(
                f"remote '{name}' has a writable push URL to the canonical "
                f'upstream: {url} (set it to a {DISABLED_PUSH} sentinel or remove it)'
            )


SCHEDULE_RE = re.compile(r'^\s*(schedule\s*:|-\s*cron\s*:)', re.IGNORECASE)


def check_workflows(repo_root: Path, violations: list[str]) -> None:
    wf_dir = repo_root / '.github' / 'workflows'
    if not wf_dir.is_dir():
        return

    # Regression assertion: the upstream-sync workflow must never come back.
    if (wf_dir / 'sync-upstream.yml').exists():
        violations.append(
            '.github/workflows/sync-upstream.yml is present (upstream-sync workflow '
            'reintroduced - it must stay deleted)'
        )

    for wf in sorted(wf_dir.glob('*.yml')) + sorted(wf_dir.glob('*.yaml')):
        text = wf.read_text(encoding='utf-8')
        lines = [ln for ln in text.splitlines() if not ln.strip().startswith('#')]
        has_schedule = any(SCHEDULE_RE.search(ln) for ln in lines)
        has_danger = False
        for stripped in (ln.strip() for ln in lines):
            for pat in DANGER_PATTERNS:
                if pat.search(stripped):
                    has_danger = True
                    violations.append(
                        f'{wf.relative_to(repo_root)}: auto upstream-sync / '
                        f'push-to-main operation: `{stripped}`'
                    )
        # Explicit regression assertion: schedule + upstream merge/push combo.
        if has_schedule and has_danger:
            violations.append(
                f'{wf.relative_to(repo_root)}: scheduled upstream merge/push behavior '
                '(a cron/schedule trigger combined with an upstream sync or push-to-main)'
            )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', default='.')
    args = ap.parse_args()
    repo_root = Path(args.repo_root).resolve()

    violations: list[str] = []
    check_remotes(violations)
    check_workflows(repo_root, violations)

    if violations:
        print('repo-isolation: FAIL')
        for v in violations:
            print(f'  - {v}')
        return 1
    print(
        'repo-isolation: PASS (no writable upstream remote; no auto upstream-sync/push-to-main workflow)'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
