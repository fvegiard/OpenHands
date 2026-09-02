from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from collections.abc import Mapping
from typing import Any

from .models import TaskEnvelope


SAFE_BRANCH_PREFIXES = ("feat/lena-", "fix/lena-", "chore/lena-", "docs/lena-")
BLOCKED_BRANCHES = {"main", "master", "production", "prod"}
SECRET_NAME_PATTERN = re.compile(
    r"(?i)(api[_-]?key|secret|token|password|passwd|private[_-]?key|service[_-]?role)"
)


class ApprovalRequiredError(PermissionError):
    pass


class UnsafeBranchError(PermissionError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def expected_approval_hash(task: TaskEnvelope) -> str:
    payload = task.model_dump(mode="json", exclude={"approval"})
    return sha256_json(payload)


def require_task_approval(task: TaskEnvelope, *, action: str, target: str) -> None:
    content_hash = expected_approval_hash(task)
    approval = task.approval
    if approval is None or not approval.is_valid_for(
        action=action,
        target=target,
        content_hash=content_hash,
    ):
        raise ApprovalRequiredError(
            "a valid task-scoped approval is required for the exact action, target, and content"
        )


def verify_internal_token(provided: str | None, env_name: str = "LENA_INTERNAL_TOKEN") -> bool:
    expected = os.environ.get(env_name, "")
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


def assert_safe_branch(branch: str) -> None:
    normalized = branch.strip()
    if not normalized or normalized in BLOCKED_BRANCHES:
        raise UnsafeBranchError(f"direct writes to branch {normalized!r} are blocked")
    if not normalized.startswith(SAFE_BRANCH_PREFIXES):
        raise UnsafeBranchError(
            f"branch must start with one of: {', '.join(SAFE_BRANCH_PREFIXES)}"
        )


def redact_mapping(value: Mapping[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, item in value.items():
        if SECRET_NAME_PATTERN.search(key):
            redacted[key] = "***REDACTED***"
        elif isinstance(item, Mapping):
            redacted[key] = redact_mapping(item)
        elif isinstance(item, list):
            redacted[key] = [
                redact_mapping(entry) if isinstance(entry, Mapping) else entry for entry in item
            ]
        else:
            redacted[key] = item
    return redacted
