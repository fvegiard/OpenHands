---
name: evaluate-construction-project
description: Evaluate a construction project's documented health, completeness, risks, costs, schedule, contracts, payments, changes, correspondence, claims, responsibilities, and evidence quality. Use for project reviews, go/no-go decisions, recovery planning, due diligence, and DR/QMD or Kahnawake evidence assessments where every conclusion must be traceable to local source files.
---

# Evaluate a construction project

Produce a decision-ready assessment from the real project record. Separate documented facts, inferences, and unknowns; never convert an inference into proof.

## Workflow

1. Confirm the project name, evaluation date, decision to support, and accessible corpus. When reporting corpus counts, state whether hidden and system files are included.
2. Inspect the live corpus before evaluating. For DR/QMD or Kahnawake, use `dr-rag status` and precise `dr-rag query "..." --json` searches when that tool is available and its index is current for the corpus. Otherwise inventory and search the accessible local corpus directly, and record the missing, stale, or mismatched index as a limitation.
3. Open the highest-ranked local sources and verify context. Do not rely on search snippets alone.
4. Record each retained item as `fact`, `inference`, or `unknown`, with exact local path, date, and source type. Include SHA-256 only when the user requests hashes or an integrity chain is necessary. Keep confidential material local.
5. Score only supported dimensions using [the evaluation schema](references/evaluation-schema.md). Report evidence coverage separately; never score an unknown as a failure.
6. Cross-check conflicting dates, amounts, versions, authors, approvals, and responsibility statements. Preserve both sides until a source resolves the conflict.
7. Deliver the compact report defined below. Do not make legal-liability conclusions; identify the documentary question that requires professional review.

## Required output

- Executive verdict: health band, overall supported score, evidence coverage, and confidence.
- Scorecard: contractual, scope/change, cost/payment, schedule, quality/safety, communications/decisions, and evidence/traceability.
- Top risks: impact, likelihood, owner if documented, supporting evidence, and next control.
- Contradictions: competing claims and what evidence would resolve them.
- Priority actions: ordered, concrete, and tied to the decision being supported.
- Evidence register: exact path for every material claim; optional SHA-256 only when requested or needed for integrity.
- Unknowns and limitations: missing access, stale index, unreadable file, absent approval, or unverified external fact.

## Completion gate

Finish only when every material sentence is supported by an evidence-register entry or explicitly labeled as an inference/unknown, all scores follow the schema, and the report states the corpus and evaluation timestamp.
