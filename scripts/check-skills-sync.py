#!/usr/bin/env python3
"""Fail if generated .agents/skills copies drift from canonical skills-core.

The canonical source of truth is quantum-agent/skills-core/<name>/SKILL.md.
`quantum skill sync` regenerates .agents/skills/<name>/SKILL.md as an in-sync
copy with a provenance banner. This gate recomputes the expected generated
content and fails on:
  * a missing generated copy for a skills-core skill;
  * a drifted/stale generated copy (content != canonical);
  * a stale EXTRA generated copy (has the provenance banner but no source).

Hand-authored .agents/skills entries (no provenance banner) are ignored.

Usage: python3 scripts/check-skills-sync.py [--repo-root .]
Exit 0 = in sync; exit 1 = drift.
"""

from __future__ import annotations

import argparse
from pathlib import Path

BANNER_MARK = 'by `quantum skill sync`'


def expected_generated(src_text: str, name: str) -> str:
    # Mirrors syncSkills() in quantum-agent/src/skills/manager.ts exactly.
    i = src_text.index('\n---', 3)
    head = src_text[: i + 4]
    body = src_text[i + 4 :]
    banner = (
        f'\n\n> Generated from `quantum-agent/skills-core/{name}/SKILL.md` '
        f'by `quantum skill sync`. Edit the source, not this copy.\n'
    )
    return head + banner + body


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', default='.')
    args = ap.parse_args()
    root = Path(args.repo_root).resolve()
    core = root / 'quantum-agent' / 'skills-core'
    agents = root / '.agents' / 'skills'

    violations: list[str] = []
    core_names: set[str] = set()

    for src in sorted(core.glob('*/SKILL.md')):
        name = src.parent.name
        core_names.add(name)
        gen = agents / name / 'SKILL.md'
        if not gen.exists():
            violations.append(
                f'missing generated copy: .agents/skills/{name}/SKILL.md '
                '(run `quantum skill sync`)'
            )
            continue
        expected = expected_generated(src.read_text(encoding='utf-8'), name)
        if gen.read_text(encoding='utf-8') != expected:
            violations.append(
                f'stale/drifted generated copy: .agents/skills/{name}/SKILL.md '
                '!= canonical skills-core (run `quantum skill sync`)'
            )

    for gen in sorted(agents.glob('*/SKILL.md')):
        name = gen.parent.name
        if BANNER_MARK in gen.read_text(encoding='utf-8') and name not in core_names:
            violations.append(
                f'stale extra generated copy: .agents/skills/{name}/SKILL.md '
                'has no skills-core source'
            )

    if violations:
        print('skills-sync: DRIFT')
        for v in violations:
            print(f'  - {v}')
        return 1
    print(
        f'skills-sync: OK ({len(core_names)} skills-core skills in sync with .agents/skills)'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
