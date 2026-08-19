"""telemetry.py — write session events to the Mavis `openagent-bridge` memory topic.

In production this would call the Mavis memory API
(`mavis memory topic-append openagent-bridge ...` or POST to the supabase
bridge table). The sandbox doesn't have that wired, so this module writes
to a local JSONL file under `$MAVIS_TELEMETRY_DIR/openagent.jsonl` and
logs the equivalent memory-topic-append command for an operator to replay
when Mavis is reachable.

The format is intentionally simple: one JSON object per line, no schema
registry. The Mavis curator pass can pick the file up on the next cron.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("mavis.openagent.telemetry")

DEFAULT_DIR = Path(os.environ.get("MAVIS_TELEMETRY_DIR", "/tmp/mavis-telemetry"))


def _ensure_dir() -> Path:
    DEFAULT_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_DIR


def record(event: str, **fields: Any) -> None:
    """Append a single telemetry line."""
    payload = {"ts": time.time(), "event": event, **fields}
    path = _ensure_dir() / "openagent.jsonl"
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, default=str) + "\n")
    except OSError as e:
        logger.warning("telemetry write failed: %s", e)
    logger.info("telemetry: %s %s", event, fields)


def flush_to_memory_topic() -> str:
    """Return the shell command to replay the buffer into the Mavis memory topic."""
    path = _ensure_dir() / "openagent.jsonl"
    if not path.exists():
        return "# no telemetry to flush"
    return (
        f"# replay into the Mavis openagent-bridge memory topic\n"
        f"cat {path} | while read -r line; do\n"
        f"  mavis memory topic-append openagent-bridge \"$line\"\n"
        f"done"
    )


if __name__ == "__main__":  # pragma: no cover
    record("test", foo="bar", n=1)
    record("test", foo="baz", n=2)
    print(flush_to_memory_topic())
