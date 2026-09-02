from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Annotated, Any
from uuid import UUID

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from .dispatcher import Dispatcher, build_dispatcher
from .models import DispatchResult, ExecutionReceipt, TaskEnvelope, TaskMode, TaskStatus
from .policy import ApprovalRequiredError, expected_approval_hash, require_task_approval, verify_internal_token
from .registry import SpecialistRegistry
from .router import LenaRouter
from .store import StateStore, build_state_store


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    query: str = Field(min_length=2, max_length=2_000)
    organization_id: UUID | None = None
    project: str | None = None
    limit: int = Field(default=8, ge=1, le=30)


class ApprovalHashResponse(BaseModel):
    task_id: UUID
    action: str
    target: str
    content_hash: str


class Runtime:
    def __init__(self) -> None:
        self.registry = SpecialistRegistry.load()
        self.router = LenaRouter(self.registry)
        self.store: StateStore = build_state_store()
        self.dispatcher: Dispatcher = build_dispatcher()


async def require_internal_auth(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    require_auth = os.environ.get("LENA_REQUIRE_INTERNAL_TOKEN", "true").casefold() != "false"
    if not require_auth:
        return
    provided = None
    if authorization and authorization.casefold().startswith("bearer "):
        provided = authorization[7:].strip()
    if not verify_internal_token(provided):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal token")


def create_app() -> FastAPI:
    runtime: Runtime | None = None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal runtime
        runtime = Runtime()
        app.state.runtime = runtime
        yield

    app = FastAPI(
        title="Léna AI Control Plane",
        version="0.1.0",
        description="Bounded 43-specialist routing and OpenHands/Luna worker dispatch.",
        lifespan=lifespan,
    )

    def current_runtime() -> Runtime:
        value = getattr(app.state, "runtime", None)
        if value is None:
            raise HTTPException(status_code=503, detail="runtime not initialized")
        return value

    @app.get("/health")
    async def health() -> dict[str, Any]:
        active = current_runtime()
        return {
            "status": "ok",
            "orchestrator": "lena",
            "specialists": len(active.registry.specialists),
            "luna_workers": len(active.registry.workers),
            "routing_version": active.registry.ROUTING_VERSION,
            "state_backend": os.environ.get("LENA_STATE_BACKEND", "memory"),
            "openhands_dispatch_configured": bool(
                os.environ.get("OPENHANDS_AUTOMATION_DISPATCH_URL", "").strip()
            ),
        }

    @app.post("/v1/route", dependencies=[Depends(require_internal_auth)])
    async def route_task(task: TaskEnvelope):
        return current_runtime().router.route(task)

    @app.post(
        "/v1/approval-hash",
        response_model=ApprovalHashResponse,
        dependencies=[Depends(require_internal_auth)],
    )
    async def approval_hash(task: TaskEnvelope) -> ApprovalHashResponse:
        target = os.environ.get("OPENHANDS_AUTOMATION_DISPATCH_URL", "openhands")
        return ApprovalHashResponse(
            task_id=task.task_id,
            action="dispatch:openhands",
            target=target,
            content_hash=expected_approval_hash(task),
        )

    @app.post(
        "/v1/tasks",
        response_model=DispatchResult,
        dependencies=[Depends(require_internal_auth)],
    )
    async def submit_task(task: TaskEnvelope) -> DispatchResult:
        active = current_runtime()
        route = active.router.route(task)
        await active.store.create_task(task, route)
        event_key = f"task.accepted:{task.idempotency_key or task.task_id}"
        await active.store.append_event(
            task_id=task.task_id,
            event_type="task.accepted",
            payload={"route": route.model_dump(mode="json")},
            idempotency_key=event_key,
        )

        if route.approval_required:
            target = os.environ.get("OPENHANDS_AUTOMATION_DISPATCH_URL", "openhands")
            try:
                require_task_approval(task, action="dispatch:openhands", target=target)
            except ApprovalRequiredError:
                return DispatchResult(
                    accepted=True,
                    status=TaskStatus.APPROVAL_REQUIRED,
                    task_id=task.task_id,
                    route=route,
                    detail="task recorded; exact approval is required before dispatch",
                )

        # Analyze and draft tasks may be dispatched to OpenHands automatically. Execute tasks
        # additionally require an idempotency key at model validation time.
        try:
            backend = await active.dispatcher.dispatch(task, route)
        except RuntimeError as exc:
            if task.mode is TaskMode.EXECUTE:
                raise HTTPException(status_code=503, detail=str(exc)) from exc
            return DispatchResult(
                accepted=True,
                status=TaskStatus.READY,
                task_id=task.task_id,
                route=route,
                detail=str(exc),
            )
        except Exception as exc:
            await active.store.append_event(
                task_id=task.task_id,
                event_type="dispatch.failed",
                payload={"error_type": type(exc).__name__, "error": str(exc)[:1_000]},
                idempotency_key=f"dispatch.failed:{task.idempotency_key or task.task_id}",
            )
            raise HTTPException(status_code=502, detail="OpenHands dispatch failed") from exc

        backend_run_id = str(
            backend.get("run_id")
            or backend.get("id")
            or backend.get("conversation_id")
            or ""
        ) or None
        await active.store.append_event(
            task_id=task.task_id,
            event_type="dispatch.accepted",
            payload={"backend_run_id": backend_run_id, "backend": backend},
            idempotency_key=f"dispatch.accepted:{task.idempotency_key or task.task_id}",
        )
        return DispatchResult(
            accepted=True,
            status=TaskStatus.DISPATCHED,
            task_id=task.task_id,
            route=route,
            backend_run_id=backend_run_id,
        )

    @app.post("/v1/receipts", dependencies=[Depends(require_internal_auth)])
    async def record_receipt(receipt: ExecutionReceipt) -> dict[str, Any]:
        stored = await current_runtime().store.record_receipt(receipt)
        return {"stored": True, "receipt": stored}

    @app.post("/v1/search", dependencies=[Depends(require_internal_auth)])
    async def search_knowledge(request: SearchRequest) -> dict[str, Any]:
        matches = await current_runtime().store.hybrid_search(
            query=request.query,
            organization_id=request.organization_id,
            project=request.project,
            limit=request.limit,
        )
        return {"query": request.query, "matches": list(matches)}

    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "lena_control_plane.app:app",
        host=os.environ.get("LENA_HOST", "0.0.0.0"),
        port=int(os.environ.get("LENA_PORT", "8788")),
        reload=False,
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("LENA_FORWARDED_ALLOW_IPS", "127.0.0.1"),
    )


if __name__ == "__main__":
    main()
