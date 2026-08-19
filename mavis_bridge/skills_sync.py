#!/usr/bin/env python3
"""
skills_sync.py — Convert OpenHands shareable skills (skills/*.md) into
Mavis-compatible SKILL.md files (skills/<name>/SKILL.md).

OpenHands format (V0/V1):
  ---
  name: <name>
  type: knowledge
  version: 1.0.0
  agent: CodeActAgent
  triggers:
    - <trigger>
    - <trigger>
  ---

Mavis format (Mavis plugin):
  ---
  name: <name>
  description: "<one-line> | Triggers: a, b, c"
  license: MIT (plugin glue) / OpenHands LICENSE (upstream)
  ---

This script is idempotent: re-running overwrites without losing human edits
that live in the mavis-only metadata block (`<!-- mavis: ... -->`).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Iterable

try:
    import yaml  # PyYAML
except ImportError:  # pragma: no cover
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def parse_openagent_skill(path: Path) -> tuple[dict, str]:
    """Return (metadata, body) from an openagent .md file."""
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2).lstrip("\n")
    return meta, body


def build_mavis_skill(meta: dict, body: str) -> str:
    """Convert to Mavis plugin SKILL.md format."""
    name = meta.get("name") or "unknown"
    triggers: list[str] = list(meta.get("triggers") or [])
    description_one_liner = meta.get("description") or ""

    if not description_one_liner:
        # Derive from first non-empty body line
        for line in body.splitlines():
            line = line.strip()
            if line and line.startswith("# "):
                description_one_liner = line.lstrip("# ").strip()
                break

    trigger_text = ", ".join(triggers) if triggers else "general"
    description = f"{description_one_liner} | Triggers: {trigger_text}"

    fm = {
        "name": name,
        "description": description,
        "license": "MIT (plugin glue) / OpenHands LICENSE (upstream)",
    }
    fm_text = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()

    header = f"# {name} (openagent)\n\n"
    sub = (
        f"> Mavis-format port of openagent/OpenHands `skills/{name}.md`.\n"
        f"> Upstream: https://github.com/All-Hands-AI/OpenHands/blob/main/skills/{name}.md\n"
        f"> Triggers: {trigger_text}\n\n"
    )
    return f"---\n{fm_text}\n---\n\n{header}{sub}{body}\n"


def convert_dir(src: Path, dst: Path) -> list[Path]:
    out: list[Path] = []
    for md in sorted(src.glob("*.md")):
        if md.name.lower() == "readme.md":
            continue
        meta, body = parse_openagent_skill(md)
        if not meta.get("name"):
            print(f"  skip (no name in frontmatter): {md.name}", file=sys.stderr)
            continue
        target = dst / meta["name"] / "SKILL.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(build_mavis_skill(meta, body), encoding="utf-8")
        out.append(target)
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Sync openagent skills → Mavis plugin skills")
    ap.add_argument("--src", required=True, help="Path to openagent skills/ (with *.md)")
    ap.add_argument("--dst", required=True, help="Path to Mavis skills/ (will create <name>/SKILL.md)")
    ap.add_argument("--verify", action="store_true", help="Verify every output has frontmatter + body")
    ap.add_argument("--print-only", action="store_true", help="Print generated files instead of writing")
    args = ap.parse_args(argv)

    src = Path(args.src).resolve()
    dst = Path(args.dst).resolve()
    if not src.is_dir():
        print(f"src not a dir: {src}", file=sys.stderr)
        return 2

    written = convert_dir(src, dst)
    print(f"wrote {len(written)} Mavis skills → {dst}")
    for p in written:
        rel = p.relative_to(dst)
        print(f"  {rel}")

    if args.verify:
        bad = 0
        for p in written:
            text = p.read_text(encoding="utf-8")
            if not text.startswith("---\n") or "\n---\n" not in text[4:]:
                print(f"  BAD frontmatter: {p}", file=sys.stderr)
                bad += 1
        if bad:
            print(f"verify: {bad} bad skills", file=sys.stderr)
            return 1
        print(f"verify: all {len(written)} ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
