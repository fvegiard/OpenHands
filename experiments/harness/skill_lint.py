#!/usr/bin/env python3
"""Deterministic skill-format linter used as a REAL command artifact.

Validates every .agents/skills/*/SKILL.md: YAML-ish frontmatter present, a
lowercase-hyphenated `name`, and a non-empty `description`. Exits non-zero (with
a precise list) on any violation so an acceptance probe can bind to a real
exit/stdout artifact rather than an in-process presence check.

Usage: python3 experiments/harness/skill_lint.py [--skills-dir <dir>]
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NAME_RE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def lint_one(md: Path) -> str | None:
    text = md.read_text(encoding='utf-8')
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        return 'no frontmatter block'
    fm = m.group(1)
    name = re.search(r'^name:\s*(.+)$', fm, re.M)
    desc = re.search(r'^description:\s*(.+)$', fm, re.M)
    if not name:
        return 'missing name'
    if not desc or not desc.group(1).strip():
        return 'missing/empty description'
    if not NAME_RE.fullmatch(name.group(1).strip()):
        return f'name not lowercase-hyphenated: {name.group(1).strip()!r}'
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--skills-dir', default=str(REPO / '.agents' / 'skills'))
    args = ap.parse_args()
    root = Path(args.skills_dir)
    if not root.is_dir():
        print(f'skill-lint: no skills dir at {root}')
        return 2
    mds = sorted(root.glob('*/SKILL.md'))
    if not mds:
        print(f'skill-lint: no SKILL.md under {root}')
        return 2
    bad: list[str] = []
    for md in mds:
        err = lint_one(md)
        rel = md.relative_to(REPO)
        if err:
            bad.append(f'{rel}: {err}')
    if bad:
        print(f'skill-lint: {len(bad)} invalid of {len(mds)}:')
        for b in bad:
            print(f'  - {b}')
        return 1
    print(f'skill-lint: OK ({len(mds)} skills valid)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
