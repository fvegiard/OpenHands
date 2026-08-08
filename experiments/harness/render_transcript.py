#!/usr/bin/env python3
"""Render a JSONL transcript to readable Markdown (deterministic).

Usage: python3 render_transcript.py --transcript <path.jsonl> --out <path.md>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from transcript_lib import read_jsonl  # noqa: E402


def render(events: list[dict]) -> str:
    if not events:
        return '# Transcript (empty)\n'
    rs = events[0]
    out = ['# Lane transcript', '']
    if rs.get('type') == 'run_start':
        out += [
            f'- agent/model/runtime: `{rs.get("agent")}` / `{rs.get("model")}` / `{rs.get("runtime")}`',
            f'- branch/base/head: `{rs.get("branch")}` / `{str(rs.get("base_sha"))[:9]}` / `{str(rs.get("head_sha"))[:9]}`',
            f'- contract bundle sha256: `{rs.get("contract_bundle_sha256")}`',
            f'- rubric sha256: `{rs.get("rubric_sha256")}`',
            '',
        ]
    out += ['| seq | ts | type | detail |', '|---|---|---|---|']
    for e in events:
        t = e['type']
        if t == 'command':
            d = f'`{e.get("cmd")}` (cwd `{e.get("cwd")}`) exit={e.get("exit_code")} out=`{str(e.get("stdout_sha256"))[:12]}`'
        elif t == 'message':
            d = f'**{e.get("role")}**: {str(e.get("text"))[:200]}'
        elif t == 'test':
            ev = f' [{e.get("evidence")}]' if e.get('evidence') else ''
            d = f'{e.get("name")}{ev}: passed={e.get("passed")} failed={e.get("failed")} skipped={e.get("skipped")}'
        elif t == 'artifact':
            d = f'`{e.get("path")}` sha256=`{str(e.get("sha256"))[:12]}` bytes={e.get("bytes")}'
        elif t == 'failure':
            d = f'FAILURE @ {e.get("where")}: {str(e.get("detail"))[:200]}'
        elif t == 'retry':
            d = f'retry of {e.get("of")} attempt {e.get("attempt")}/{e.get("budget")}'
        elif t == 'commit':
            d = f'commit `{str(e.get("sha"))[:9]}`: {e.get("message")}'
        elif t == 'changed_files':
            d = ', '.join(f'`{f}`' for f in (e.get('files') or []))
        elif t == 'verdict':
            d = f'**{e.get("result")}** backed_by={e.get("backed_by")}'
        elif t in ('run_start', 'contract_ack'):
            d = f'contract `{str(e.get("contract_bundle_sha256"))[:12]}`'
        else:
            d = ''
        d = d.replace('|', '\\|')
        out.append(f'| {e["seq"]} | {e.get("ts")} | {t} | {d} |')
    out.append('')
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--transcript', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    md = render(read_jsonl(Path(args.transcript)))
    Path(args.out).write_text(md, encoding='utf-8')
    print(f'wrote {args.out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
