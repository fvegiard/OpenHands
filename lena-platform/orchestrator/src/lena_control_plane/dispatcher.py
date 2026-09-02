from __future__ import annotations

import os
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

from .models import RoutePlan, TaskEnvelope


class Dispatcher(Protocol):
    async def dispatch(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]: ...


class DisabledDispatcher:
    async def dispatch(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]:
        del task, route
        raise RuntimeError(
            "OpenHands dispatch is disabled; configure OPENHANDS_AUTOMATION_DISPATCH_URL"
        )


class OpenHandsDispatcher:
    def __init__(
        self,
        *,
        dispatch_url: str,
        api_key: str | None,
        agent_profile_id: str | None,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.dispatch_url = dispatch_url
        self.api_key = api_key
        self.agent_profile_id = agent_profile_id
        self.timeout_seconds = timeout_seconds
        self._validate_url()

    def _validate_url(self) -> None:
        parsed = urlparse(self.dispatch_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("OPENHANDS_AUTOMATION_DISPATCH_URL must be an absolute HTTP URL")
        if parsed.scheme == "http":
            host = (parsed.hostname or "").casefold()
            allowed = host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".ts.net")
            if not allowed:
                raise ValueError(
                    "unencrypted OpenHands dispatch is allowed only for localhost or Tailscale DNS"
                )

    @classmethod
    def from_env(cls) -> OpenHandsDispatcher:
        url = os.environ.get("OPENHANDS_AUTOMATION_DISPATCH_URL", "").strip()
        if not url:
            raise RuntimeError("OPENHANDS_AUTOMATION_DISPATCH_URL is required")
        return cls(
            dispatch_url=url,
            api_key=os.environ.get("OPENHANDS_AUTOMATION_API_KEY"),
            agent_profile_id=os.environ.get("OPENHANDS_LENA_PROFILE_ID"),
            timeout_seconds=float(os.environ.get("OPENHANDS_DISPATCH_TIMEOUT_SECONDS", "60")),
        )

    async def dispatch(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "X-Idempotency-Key": task.idempotency_key or str(task.task_id),
        }
        if self.api_key:
            headers["X-Session-API-Key"] = self.api_key

        payload = {
            "task": task.model_dump(mode="json"),
            "route": route.model_dump(mode="json"),
            "agent_profile_id": self.agent_profile_id,
            "orchestrator": "lena",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(self.dispatch_url, headers=headers, json=payload)
        response.raise_for_status()
        if not response.content:
            return {"accepted": True}
        data = response.json()
        if not isinstance(data, dict):
            return {"accepted": True, "response": data}
        return data


def build_dispatcher() -> Dispatcher:
    if not os.environ.get("OPENHANDS_AUTOMATION_DISPATCH_URL", "").strip():
        return DisabledDispatcher()
    return OpenHandsDispatcher.from_env()
