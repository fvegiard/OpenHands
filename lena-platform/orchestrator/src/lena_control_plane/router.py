from __future__ import annotations

import re
from collections import defaultdict

from .models import (
    RiskLevel,
    RoutePlan,
    SpecialistSelection,
    TaskEnvelope,
    TaskMode,
    TaskStatus,
    WorkerAssignment,
)
from .registry import Specialist, SpecialistRegistry


SENSITIVE_EFFECT_PREFIXES = (
    "deploy",
    "delete",
    "send",
    "publish",
    "purchase",
    "permission",
    "production",
    "database-migrate",
    "field-operation",
)


class LenaRouter:
    def __init__(self, registry: SpecialistRegistry) -> None:
        self.registry = registry

    @staticmethod
    def _normalize(text: str) -> str:
        return re.sub(r"\s+", " ", text.casefold()).strip()

    def _score(self, specialist: Specialist, task: TaskEnvelope) -> tuple[int, list[str]]:
        text = self._normalize(task.text)
        score = 0
        reasons: list[str] = []

        requested = {value.casefold() for value in task.requested_specialists}
        if specialist.id.casefold() in requested or specialist.slug.casefold() in requested:
            score += 100
            reasons.append("explicitly requested")

        matched_keywords = [
            keyword for keyword in specialist.keywords if self._normalize(keyword) in text
        ]
        if matched_keywords:
            score += 12 * len(matched_keywords)
            reasons.append(f"matched: {', '.join(matched_keywords[:4])}")

        domain_tokens = set(re.findall(r"[a-z0-9]+", specialist.domain.casefold()))
        text_tokens = set(re.findall(r"[a-z0-9]+", text))
        domain_matches = sorted(domain_tokens & text_tokens)
        if domain_matches:
            score += 3 * len(domain_matches)
            reasons.append(f"domain: {', '.join(domain_matches)}")

        if specialist.id == "S01":
            score += 5
            reasons.append("mandatory mission framing")
        if specialist.id == "S43" and task.risk in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            score += 40
            reasons.append("independent verification required")
        if specialist.id == "S42" and task.mode is TaskMode.EXECUTE:
            score += 8
            reasons.append("execution platform control")

        return score, reasons

    def _select_specialists(self, task: TaskEnvelope) -> list[SpecialistSelection]:
        ranked: list[tuple[int, Specialist, list[str]]] = []
        for specialist in self.registry.specialists:
            score, reasons = self._score(specialist, task)
            ranked.append((score, specialist, reasons))

        ranked.sort(key=lambda item: (-item[0], item[1].id))
        selected = [item for item in ranked if item[0] > 0][: self.registry.max_specialists]

        if not selected:
            intake = self.registry.by_id("S01")
            selected = [(5, intake, ["fallback mission framing"])]

        selected_ids = {item[1].id for item in selected}
        if "S01" not in selected_ids:
            intake = self.registry.by_id("S01")
            selected = [(5, intake, ["mandatory mission framing"]), *selected]

        if task.risk in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            selected_ids = {item[1].id for item in selected}
            if "S43" not in selected_ids:
                verifier = self.registry.by_id("S43")
                selected.append((40, verifier, ["independent verification required"]))

        selected.sort(key=lambda item: (-item[0], item[1].id))
        selected = selected[: self.registry.max_specialists]

        # Mandatory roles win over low-scoring matches when the bound is reached.
        required_ids = {"S01"}
        if task.risk in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            required_ids.add("S43")
        current_ids = {item[1].id for item in selected}
        for required_id in sorted(required_ids - current_ids):
            required = self.registry.by_id(required_id)
            replacement = next(
                (
                    index
                    for index in range(len(selected) - 1, -1, -1)
                    if selected[index][1].id not in required_ids
                ),
                None,
            )
            item = (
                40 if required_id == "S43" else 5,
                required,
                [
                    "independent verification required"
                    if required_id == "S43"
                    else "mandatory mission framing"
                ],
            )
            if replacement is None:
                selected.append(item)
            else:
                selected[replacement] = item

        selected.sort(key=lambda item: item[1].id)
        return [
            SpecialistSelection(
                specialist_id=specialist.id,
                slug=specialist.slug,
                score=score,
                reason="; ".join(reasons) if reasons else "bounded fallback",
            )
            for score, specialist, reasons in selected
        ]

    def _build_workers(
        self,
        task: TaskEnvelope,
        specialists: list[SpecialistSelection],
        *,
        approval_required: bool,
    ) -> tuple[list[WorkerAssignment], str | None, str | None]:
        grouped: dict[str, list[str]] = defaultdict(list)
        for selection in specialists:
            worker_id = self.registry.by_id(selection.specialist_id).worker
            grouped[worker_id].append(selection.specialist_id)

        grouped.setdefault("luna-planner", [])
        if task.mode in {TaskMode.DRAFT, TaskMode.EXECUTE}:
            grouped.setdefault("luna-builder", [])
        if task.risk in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            grouped.setdefault("luna-reviewer", ["S43"])
        if task.mode is TaskMode.EXECUTE:
            grouped.setdefault("luna-operator", [])

        phase_map = {
            "luna-reader": ["research", "evidence"],
            "luna-planner": ["intake", "route", "plan"],
            "luna-builder": ["draft", "implement"],
            "luna-tester": ["test", "surface-qa"],
            "luna-reviewer": ["independent-review", "verdict"],
            "luna-operator": ["approved-external-effect", "receipt"],
        }

        writer_worker_id = "luna-builder" if "luna-builder" in grouped else None
        reviewer_worker_id = "luna-reviewer" if "luna-reviewer" in grouped else None

        assignments = [
            WorkerAssignment(
                worker_id=worker_id,
                phases=phase_map[worker_id],
                specialist_ids=sorted(set(specialist_ids)),
                can_write=worker_id == writer_worker_id,
                requires_approval=worker_id == "luna-operator" and approval_required,
            )
            for worker_id, specialist_ids in sorted(grouped.items())
        ]

        non_operator_parallel = sum(
            1 for item in assignments if item.worker_id != "luna-operator"
        )
        if non_operator_parallel > self.registry.max_parallel_workers:
            # Collapse research roles into the planner while preserving specialist attribution.
            overflow = assignments[self.registry.max_parallel_workers :]
            kept = assignments[: self.registry.max_parallel_workers]
            planner = next(item for item in kept if item.worker_id == "luna-planner")
            for item in overflow:
                planner.specialist_ids = sorted(
                    set(planner.specialist_ids) | set(item.specialist_ids)
                )
                planner.phases = sorted(set(planner.phases) | set(item.phases))
            assignments = kept

        return assignments, writer_worker_id, reviewer_worker_id

    def route(self, task: TaskEnvelope) -> RoutePlan:
        approval_reasons: list[str] = []
        if task.risk is RiskLevel.CRITICAL:
            approval_reasons.append("critical-risk task")
        if task.mode is TaskMode.EXECUTE and task.requested_effects:
            approval_reasons.append("external effects requested")
        for effect in task.requested_effects:
            normalized = effect.casefold()
            if normalized.startswith(SENSITIVE_EFFECT_PREFIXES):
                approval_reasons.append(f"sensitive effect: {effect}")

        approval_reasons = list(dict.fromkeys(approval_reasons))
        approval_required = bool(approval_reasons)
        specialists = self._select_specialists(task)
        workers, writer, reviewer = self._build_workers(
            task,
            specialists,
            approval_required=approval_required,
        )

        status = TaskStatus.APPROVAL_REQUIRED if approval_required else TaskStatus.READY
        return RoutePlan(
            task_id=task.task_id,
            status=status,
            specialists=specialists,
            workers=workers,
            writer_worker_id=writer,
            reviewer_worker_id=reviewer,
            approval_required=approval_required,
            approval_reasons=approval_reasons,
            stop_conditions=self.registry.stop_conditions,
            routing_version=self.registry.ROUTING_VERSION,
        )
