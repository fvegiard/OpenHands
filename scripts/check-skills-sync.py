#!/usr/bin/env python3
"""Fail if generated .agents/skills copies drift from canonical skills-core.

The canonical source of truth is quantum-agent/skills-core/<name>/.
`quantum skill sync` regenerates .agents/skills/<name>/ as an in-sync copy with
a provenance banner in SKILL.md. This gate recomputes the expected generated
content and fails on missing, drifted, or stale generated files/directories.

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
        source_dir = src.parent
        generated_dir = agents / name
        gen = generated_dir / 'SKILL.md'
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
        expected_assets = {
            path.relative_to(source_dir)
            for path in source_dir.rglob('*')
            if path.is_file()
        }
        actual_assets = {
            path.relative_to(generated_dir)
            for path in generated_dir.rglob('*')
            if path.is_file()
        }
        for relative_path in sorted(expected_assets - actual_assets):
            violations.append(
                f'missing generated asset: .agents/skills/{name}/{relative_path}'
            )
        for relative_path in sorted(actual_assets - expected_assets):
            violations.append(
                f'stale extra generated asset: .agents/skills/{name}/{relative_path}'
            )
        for relative_path in sorted(expected_assets & actual_assets):
            if relative_path == Path('SKILL.md'):
                continue
            source_bytes = (source_dir / relative_path).read_bytes()
            generated_bytes = (generated_dir / relative_path).read_bytes()
            if source_bytes != generated_bytes:
                violations.append(
                    f'drifted generated asset: .agents/skills/{name}/{relative_path}'
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
