from __future__ import annotations

import os
from collections.abc import Sequence
from typing import Any, Protocol
from uuid import UUID

import httpx

from .models import ExecutionReceipt, RoutePlan, TaskEnvelope


class StateStore(Protocol):
    async def create_task(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]: ...

    async def append_event(
        self,
        *,
        task_id: UUID,
        event_type: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]: ...

    async def record_receipt(self, receipt: ExecutionReceipt) -> dict[str, Any]: ...

    async def hybrid_search(
        self,
        *,
        query: str,
        organization_id: UUID | None,
        project: str | None,
        limit: int,
    ) -> Sequence[dict[str, Any]]: ...


class MemoryStateStore:
    def __init__(self) -> None:
        self.tasks: dict[str, dict[str, Any]] = {}
        self.events: dict[str, dict[str, Any]] = {}
        self.receipts: dict[str, dict[str, Any]] = {}

    async def create_task(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]:
        record = {
            "task": task.model_dump(mode="json"),
            "route": route.model_dump(mode="json"),
        }
        self.tasks[str(task.task_id)] = record
        return record

    async def append_event(
        self,
        *,
        task_id: UUID,
        event_type: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]:
        event = {
            "task_id": str(task_id),
            "event_type": event_type,
            "payload": payload,
            "idempotency_key": idempotency_key,
        }
        self.events.setdefault(idempotency_key, event)
        return self.events[idempotency_key]

    async def record_receipt(self, receipt: ExecutionReceipt) -> dict[str, Any]:
        record = receipt.model_dump(mode="json")
        self.receipts.setdefault(receipt.idempotency_key, record)
        return self.receipts[receipt.idempotency_key]

    async def hybrid_search(
        self,
        *,
        query: str,
        organization_id: UUID | None,
        project: str | None,
        limit: int,
    ) -> Sequence[dict[str, Any]]:
        del query, organization_id, project, limit
        return []


class SupabaseStateStore:
    def __init__(
        self,
        *,
        url: str,
        service_role_key: str,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.url = url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    @classmethod
    def from_env(cls) -> SupabaseStateStore:
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        return cls(url=url, service_role_key=key)

    async def _rpc(self, name: str, body: dict[str, Any]) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.url}/rest/v1/rpc/{name}",
                headers=self._headers,
                json=body,
            )
        response.raise_for_status()
        if not response.content:
            return {}
        return response.json()

    async def create_task(self, task: TaskEnvelope, route: RoutePlan) -> dict[str, Any]:
        result = await self._rpc(
            "lena_create_task",
            {
                "p_task": task.model_dump(mode="json"),
                "p_route": route.model_dump(mode="json"),
            },
        )
        return dict(result)

    async def append_event(
        self,
        *,
        task_id: UUID,
        event_type: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]:
        result = await self._rpc(
            "lena_append_event",
            {
                "p_task_id": str(task_id),
                "p_event_type": event_type,
                "p_payload": payload,
                "p_idempotency_key": idempotency_key,
            },
        )
        return dict(result)

    async def record_receipt(self, receipt: ExecutionReceipt) -> dict[str, Any]:
        result = await self._rpc(
            "lena_record_receipt",
            {"p_receipt": receipt.model_dump(mode="json")},
        )
        return dict(result)

    async def hybrid_search(
        self,
        *,
        query: str,
        organization_id: UUID | None,
        project: str | None,
        limit: int,
    ) -> Sequence[dict[str, Any]]:
        result = await self._rpc(
            "lena_hybrid_search",
            {
                "p_query": query,
                "p_organization_id": str(organization_id) if organization_id else None,
                "p_project": project,
                "p_limit": limit,
            },
        )
        return list(result)


def build_state_store() -> StateStore:
    backend = os.environ.get("LENA_STATE_BACKEND", "memory").strip().casefold()
    if backend == "memory":
        return MemoryStateStore()
    if backend == "supabase":
        return SupabaseStateStore.from_env()
    raise RuntimeError(f"unsupported LENA_STATE_BACKEND: {backend}")
