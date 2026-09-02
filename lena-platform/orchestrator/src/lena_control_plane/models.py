from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskMode(StrEnum):
    ANALYZE = "analyze"
    DRAFT = "draft"
    EXECUTE = "execute"


class TaskStatus(StrEnum):
    INTAKE = "intake"
    READY = "ready"
    APPROVAL_REQUIRED = "approval_required"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    VERIFIED = "verified"
    FAILED = "failed"
    BLOCKED = "blocked"


class ApprovalContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str | None = None
    action: str | None = None
    target: str | None = None
    content_hash: str | None = None
    expires_at: datetime | None = None

    def is_valid_for(self, *, action: str, target: str, content_hash: str) -> bool:
        if not self.token or not self.expires_at:
            return False
        now = datetime.now(UTC)
        expiry = self.expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=UTC)
        return (
            expiry > now
            and self.action == action
            and self.target == target
            and self.content_hash == content_hash
        )


class TaskEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    task_id: UUID = Field(default_factory=uuid4)
    external_id: str | None = None
    organization_id: UUID | None = None
    company: str
    project: str
    objective: str = Field(min_length=3, max_length=500)
    description: str = Field(default="", max_length=20_000)
    definition_of_done: list[str] = Field(default_factory=list, max_length=25)
    risk: RiskLevel = RiskLevel.MEDIUM
    mode: TaskMode = TaskMode.ANALYZE
    requested_effects: list[str] = Field(default_factory=list, max_length=25)
    source_refs: list[str] = Field(default_factory=list, max_length=100)
    requested_specialists: list[str] = Field(default_factory=list, max_length=10)
    idempotency_key: str | None = Field(default=None, max_length=200)
    approval: ApprovalContext | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("company", "project")
    @classmethod
    def require_identity(cls, value: str) -> str:
        if not value:
            raise ValueError("company and project are required")
        return value

    @field_validator("definition_of_done")
    @classmethod
    def unique_done_conditions(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values if value.strip()]
        return list(dict.fromkeys(normalized))

    @model_validator(mode="after")
    def execute_requires_idempotency(self) -> TaskEnvelope:
        if self.mode is TaskMode.EXECUTE and not self.idempotency_key:
            raise ValueError("execute mode requires idempotency_key")
        return self

    @property
    def text(self) -> str:
        return " ".join(
            part
            for part in [self.objective, self.description, " ".join(self.requested_effects)]
            if part
        )


class SpecialistSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    specialist_id: str
    slug: str
    score: int = Field(ge=0)
    reason: str


class WorkerAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_id: str
    phases: list[str]
    specialist_ids: list[str]
    can_write: bool = False
    requires_approval: bool = False


class RoutePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: UUID
    status: TaskStatus
    specialists: list[SpecialistSelection]
    workers: list[WorkerAssignment]
    writer_worker_id: str | None
    reviewer_worker_id: str | None
    approval_required: bool
    approval_reasons: list[str]
    stop_conditions: list[str]
    routing_version: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DispatchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: bool
    status: TaskStatus
    task_id: UUID
    route: RoutePlan
    backend_run_id: str | None = None
    detail: str | None = None


class ExecutionReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receipt_id: UUID = Field(default_factory=uuid4)
    task_id: UUID
    idempotency_key: str
    actor: str
    action: str
    target: str
    status: str
    result_hash: str | None = None
    evidence_refs: list[str] = Field(default_factory=list)
    error: str | None = None
    started_at: datetime
    finished_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)
