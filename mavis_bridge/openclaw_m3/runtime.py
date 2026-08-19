"""runtime.py — thin HTTP client for a running OpenHands backend.

The Mavis plugin doesn't *embed* OpenHands — that would duplicate 254 MB of
Python/React. Instead it expects an OpenHands instance reachable at
$OPENHANDS_BASE_URL (default http://localhost:3000) and proxies the few
endpoints we care about:

  * POST /api/v1/tasks                  — start a new task
  * GET  /api/v1/conversations/{id}      — poll status
  * GET  /api/v1/skills                 — list loaded skills
  * POST /api/v1/conversations/{id}/events — push context events

The Claude Desktop integration (upstream `claude_desktop/rest_client.py`)
already implements a faithful version of this; we keep the plugin-side
client as a minimal fallback for the stdio MCP path.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("mavis.openagent.runtime")

DEFAULT_TIMEOUT_S = 30
DEFAULT_BASE_URL = os.environ.get("OPENHANDS_BASE_URL", "http://localhost:3000")


class OpenHandsRuntimeError(RuntimeError):
    pass


@dataclass
class OpenHandsClient:
    base_url: str = DEFAULT_BASE_URL
    timeout_s: int = DEFAULT_TIMEOUT_S
    api_key: str | None = os.environ.get("OPENHANDS_API_KEY")

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict:
        url = f"{self.base_url.rstrip('/')}{path}"
        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={"content-type": "application/json", **self._auth_headers()},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            raise OpenHandsRuntimeError(f"HTTP {e.code} {method} {path}: {e.reason}") from e
        except urllib.error.URLError as e:
            raise OpenHandsRuntimeError(f"connection failed: {e.reason}") from e

    def _auth_headers(self) -> dict[str, str]:
        if self.api_key:
            return {"Authorization": f"Bearer {self.api_key}"}
        return {}

    # ---- public surface ---------------------------------------------------

    def list_skills(self) -> list[str]:
        data = self._request("GET", "/api/v1/skills")
        return [s.get("name", "?") for s in data.get("skills", [])]

    def start_task(self, task: str, workspace: str) -> str:
        data = self._request(
            "POST",
            "/api/v1/tasks",
            body={"task": task, "workspace": workspace},
        )
        return str(data.get("session_id", ""))

    def get_conversation(self, session_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/v1/conversations/{session_id}")


if __name__ == "__main__":  # pragma: no cover
    c = OpenHandsClient()
    try:
        print("skills:", c.list_skills())
    except OpenHandsRuntimeError as e:
        print(f"(no live OpenHands backend, that's ok in dev): {e}")
