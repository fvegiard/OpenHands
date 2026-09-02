#!/usr/bin/env python3
"""Issue a short-lived Léna approval token on a trusted operator machine.

The signing key is read from LENA_APPROVAL_SIGNING_KEY and never printed.
The task JSON must be the exact envelope that will be dispatched.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

PLATFORM_ROOT = Path(__file__).resolve().parents[1]
ORCHESTRATOR_SRC = PLATFORM_ROOT / "orchestrator" / "src"
sys.path.insert(0, str(ORCHESTRATOR_SRC))

from lena_control_plane.models import TaskEnvelope  # noqa: E402
from lena_control_plane.policy import (  # noqa: E402
    expected_approval_hash,
    issue_approval_token,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_json", type=Path)
    parser.add_argument("--action", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--approver", required=True)
    parser.add_argument("--minutes", type=int, default=15)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 1 <= args.minutes <= 60:
        raise SystemExit("--minutes must be between 1 and 60")
    task = TaskEnvelope.model_validate_json(args.task_json.read_text(encoding="utf-8"))
    expires_at = datetime.now(UTC) + timedelta(minutes=args.minutes)
    token = issue_approval_token(
        task=task,
        action=args.action,
        target=args.target,
        expires_at=expires_at,
        approver=args.approver,
    )
    result = {
        "task_id": str(task.task_id),
        "action": args.action,
        "target": args.target,
        "content_hash": expected_approval_hash(task),
        "expires_at": expires_at.isoformat(),
        "approval_token": token,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
