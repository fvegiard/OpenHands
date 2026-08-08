#!/usr/bin/env python3
"""Superiority gate for synthesis (point 6 of the no-drift contract).

A lane may be declared SUPERIOR — and thus contribute code to integration — only
when BOTH hold:
  1. 100% local critical acceptance (critical_ok on the identical critical set), and
  2. a strictly higher IDENTICAL runnable score than every other lane over the
     same real-item set, by a margin (single-run margin here; true statistical
     superiority needs repeated identical-seed runs, reported NOT_VERIFIED until
     provided).

Otherwise the verdict is NOT_VERIFIED. Absence of comparison lanes, mismatched
rubric versions, or a differing runnable item set all yield NOT_VERIFIED — never
a default win.

Usage: python3 experiments/harness/compare_lanes.py [--margin 1]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LANES = REPO / 'experiments' / 'lanes'


def load_lanes() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for res in sorted(LANES.glob('*/results-*.json')):
        data = json.loads(res.read_text())
        s = data.get('summary', {})
        real_ids = sorted(
            r['id'] for r in data.get('results', []) if r.get('evidence') == 'real'
        )
        out[s.get('lane', res.parent.name)] = {
            'rubric_version': s.get('rubric_version'),
            'critical_ok': bool(s.get('critical_ok')),
            'benchmark_pass': int(s.get('benchmark_pass', 0)),
            'benchmark_total': int(s.get('benchmark_total', 0)),
            'real_ids': real_ids,
        }
    return out


def compare(lanes: dict[str, dict], margin: int) -> tuple[str, str]:
    if len(lanes) < 2:
        return 'NOT_VERIFIED', (
            f'insufficient lanes to compare ({sorted(lanes)}); need >=2 with '
            'identical rubric + runnable set'
        )
    versions = {v['rubric_version'] for v in lanes.values()}
    if len(versions) != 1:
        return 'NOT_VERIFIED', f'mismatched rubric versions across lanes: {versions}'
    id_sets = {tuple(v['real_ids']) for v in lanes.values()}
    if len(id_sets) != 1:
        return 'NOT_VERIFIED', 'lanes do not share an identical runnable item set'
    eligible = {k: v for k, v in lanes.items() if v['critical_ok']}
    if not eligible:
        return 'NOT_VERIFIED', 'no lane reached 100% critical local acceptance'
    ranked = sorted(
        eligible.items(), key=lambda kv: kv[1]['benchmark_pass'], reverse=True
    )
    top, second = ranked[0], (ranked[1] if len(ranked) > 1 else None)
    if second is None:
        return 'NOT_VERIFIED', 'only one eligible lane; cannot establish superiority'
    if top[1]['benchmark_pass'] - second[1]['benchmark_pass'] >= margin:
        return top[0], (
            f'{top[0]} superior: critical_ok + score '
            f'{top[1]["benchmark_pass"]}/{top[1]["benchmark_total"]} > '
            f'{second[0]} {second[1]["benchmark_pass"]} (margin>={margin})'
        )
    return 'NOT_VERIFIED', (
        f'top two lanes within margin ({top[0]}={top[1]["benchmark_pass"]}, '
        f'{second[0]}={second[1]["benchmark_pass"]}); not statistically superior'
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--margin', type=int, default=1)
    args = ap.parse_args()
    lanes = load_lanes()
    winner, reason = compare(lanes, args.margin)
    print(json.dumps({'winner': winner, 'reason': reason, 'lanes': lanes}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
