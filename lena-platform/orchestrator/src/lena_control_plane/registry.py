from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class Specialist(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    slug: str
    name: str
    domain: str
    mission: str
    worker: str
    risk: str
    tools: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class WorkerDefinition(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    purpose: str
    permissions: list[str]
    forbidden: list[str]
    max_parallel: int = Field(ge=1, le=20)
    timeout_seconds: int = Field(ge=30, le=86_400)


class SpecialistRegistry:
    EXPECTED_SPECIALISTS = 43
    ROUTING_VERSION = "lena-routing-v1"

    def __init__(
        self,
        specialists: list[Specialist],
        workers: list[WorkerDefinition],
        *,
        selection: dict[str, object],
    ) -> None:
        self.specialists = specialists
        self.workers = workers
        self.selection = selection
        self._by_id = {item.id: item for item in specialists}
        self._by_slug = {item.slug: item for item in specialists}
        self._workers_by_id = {worker.id: worker for worker in workers}
        self._validate()

    @classmethod
    def default_root(cls) -> Path:
        return Path(__file__).resolve().parents[3]

    @classmethod
    def load(
        cls,
        specialist_path: str | Path | None = None,
        worker_path: str | Path | None = None,
    ) -> SpecialistRegistry:
        platform_root = cls.default_root()
        specialists_file = Path(
            specialist_path
            or os.environ.get(
                "LENA_SPECIALIST_REGISTRY",
                platform_root / "agents" / "specialists.json",
            )
        )
        workers_file = Path(
            worker_path
            or os.environ.get(
                "LENA_WORKER_REGISTRY",
                platform_root / "agents" / "luna-workers.json",
            )
        )

        specialist_payload = json.loads(specialists_file.read_text(encoding="utf-8"))
        worker_payload = json.loads(workers_file.read_text(encoding="utf-8"))
        specialists = [Specialist.model_validate(item) for item in specialist_payload["specialists"]]
        workers = [WorkerDefinition.model_validate(item) for item in worker_payload["workers"]]
        return cls(specialists, workers, selection=specialist_payload["selection"])

    def _validate(self) -> None:
        if len(self.specialists) != self.EXPECTED_SPECIALISTS:
            raise ValueError(
                f"expected {self.EXPECTED_SPECIALISTS} specialists, got {len(self.specialists)}"
            )
        expected_ids = [f"S{index:02d}" for index in range(1, self.EXPECTED_SPECIALISTS + 1)]
        actual_ids = [item.id for item in self.specialists]
        if actual_ids != expected_ids:
            raise ValueError("specialist IDs must be sequential S01..S43")
        if len(self._by_id) != len(self.specialists):
            raise ValueError("specialist IDs must be unique")
        if len(self._by_slug) != len(self.specialists):
            raise ValueError("specialist slugs must be unique")
        if len(self._workers_by_id) != len(self.workers):
            raise ValueError("worker IDs must be unique")

        unknown_workers = sorted(
            {item.worker for item in self.specialists} - set(self._workers_by_id)
        )
        if unknown_workers:
            raise ValueError(f"specialists reference unknown workers: {unknown_workers}")

        max_specialists = int(self.selection.get("max_specialists_per_task", 0))
        max_workers = int(self.selection.get("max_parallel_luna_workers", 0))
        if not 1 <= max_specialists <= 10:
            raise ValueError("max_specialists_per_task must be between 1 and 10")
        if not 1 <= max_workers <= 10:
            raise ValueError("max_parallel_luna_workers must be between 1 and 10")
        if self.selection.get("single_writer") is not True:
            raise ValueError("single_writer must remain enabled")

    @property
    def max_specialists(self) -> int:
        return int(self.selection["max_specialists_per_task"])

    @property
    def max_parallel_workers(self) -> int:
        return int(self.selection["max_parallel_luna_workers"])

    @property
    def stop_conditions(self) -> list[str]:
        values = self.selection.get("default_stop_conditions", [])
        return [str(value) for value in values]

    def by_id(self, specialist_id: str) -> Specialist:
        try:
            return self._by_id[specialist_id]
        except KeyError as exc:
            raise KeyError(f"unknown specialist: {specialist_id}") from exc

    def by_slug(self, slug: str) -> Specialist:
        try:
            return self._by_slug[slug]
        except KeyError as exc:
            raise KeyError(f"unknown specialist: {slug}") from exc

    def worker(self, worker_id: str) -> WorkerDefinition:
        try:
            return self._workers_by_id[worker_id]
        except KeyError as exc:
            raise KeyError(f"unknown worker: {worker_id}") from exc
