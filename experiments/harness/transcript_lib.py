"""Shared helpers for tamper-evident, redacted experiment transcripts.

Deterministic, stdlib-only. Used by the appender (to write conformant events),
the validator (to recompute the hash chain), and the renderer.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

GENESIS = 'GENESIS'

# Raw-secret patterns. If any of these match a transcript string, redaction has
# failed (values must be replaced with [REDACTED]). Env var NAMES are fine.
SECRET_PATTERNS = [
    re.compile(r'sk-[A-Za-z0-9_\-]{16,}'),
    re.compile(r'ghs_[A-Za-z0-9]{20,}'),
    re.compile(r'gh[pousr]_[A-Za-z0-9]{20,}'),
    re.compile(r'xox[baprs]-[A-Za-z0-9\-]{10,}'),
    re.compile(r'AKIA[0-9A-Z]{16}'),
    re.compile(r'eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}'),
]

REQUIRED_BY_TYPE = {
    'run_start': [
        'agent',
        'model',
        'runtime',
        'branch',
        'base_sha',
        'head_sha',
        'contract_bundle_sha256',
        'rubric_sha256',
    ],
    'contract_ack': ['contract_bundle_sha256'],
    'message': ['role', 'text'],
    'tool_call': ['name', 'args'],
    'command': ['cmd', 'cwd', 'exit_code', 'stdout_sha256', 'stderr_sha256'],
    'changed_files': ['files'],
    'commit': ['sha', 'message'],
    'test': ['name', 'passed', 'failed', 'skipped'],
    'artifact': ['path', 'sha256', 'bytes'],
    'failure': ['where', 'detail'],
    'retry': ['of', 'attempt', 'budget'],
    'verdict': ['result', 'backed_by'],
}

VERDICT_RESULTS = {'VERIFIED', 'NOT_VERIFIED', 'PASS', 'FAIL'}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_hex(Path(path).read_bytes())


def canonical(obj) -> str:
    """Deterministic JSON serialization (sorted keys, no whitespace)."""
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def event_hash(event: dict) -> str:
    """Hash of an event's canonical form, excluding its own prev_hash link.

    The chain is over (seq, ts, type, payload) so a later event's prev_hash
    pins the exact content of the previous event.
    """
    core = {k: v for k, v in event.items() if k != 'prev_hash'}
    return sha256_hex(canonical(core).encode('utf-8'))


def contract_bundle_sha256(lock: dict) -> str:
    return lock['bundle_sha256']


def read_jsonl(path: Path) -> list[dict]:
    events = []
    for i, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        events.append(json.loads(line))
    return events


class TranscriptWriter:
    """Append-only conformant transcript writer with an automatic hash chain."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        existing = read_jsonl(self.path) if self.path.exists() else []
        self._seq = existing[-1]['seq'] if existing else 0
        self._prev = event_hash(existing[-1]) if existing else GENESIS

    def append(self, type: str, ts: str, **payload) -> dict:
        self._seq += 1
        event = {
            'seq': self._seq,
            'ts': ts,
            'type': type,
            'prev_hash': self._prev,
            **payload,
        }
        with self.path.open('a', encoding='utf-8') as f:
            f.write(canonical(event) + '\n')
        self._prev = event_hash(event)
        return event
