# Construction project evaluation schema

## Dimensions and weights

| Dimension | Weight | Evaluate |
|---|---:|---|
| Contractual | 15 | Executed contract, scope, roles, insurance, notices, approvals |
| Scope and change | 15 | Baseline scope, directives, change orders, authorization, cumulative effect |
| Cost and payment | 20 | Budget, commitments, invoices, payment status, holdbacks, disputed amounts |
| Schedule | 15 | Baseline/current schedule, milestones, delays, notices, recovery plan |
| Quality and safety | 10 | Deficiencies, inspections, closeout, incidents, corrective actions |
| Communications and decisions | 10 | Decision log, response times, escalation, responsibility statements |
| Evidence and traceability | 15 | Completeness, provenance, versioning, source accessibility, contradictions |

## Scoring

Score a dimension from 0 to 5 only when the evidence is sufficient:

- 5: complete, current, internally consistent, controlled.
- 4: minor gaps with no material decision impact.
- 3: material gaps or active risks with a credible control plan.
- 2: major unresolved exposure or weak controls.
- 1: critical documentary or operational failure.
- 0: documented absence or failure, not merely missing evidence.
- `not_scored`: evidence is insufficient; list the missing evidence.

Calculate:

```text
coverage_percent = 100 * scored_weight / 100
overall_supported_score = 100 * sum(weight * score / 5) / scored_weight
```

Round to one decimal. Always report both numbers. Never present a high score with low coverage as a reliable project verdict.

Health bands: 85-100 strong; 70-84.9 watch; 50-69.9 at risk; below 50 critical. If coverage is below 70%, prefix the band with `PROVISIONAL`.

## Evidence item

```json
{
  "id": "E-001",
  "classification": "fact|inference|unknown",
  "claim": "Concise statement",
  "source_path": "absolute local path or null",
  "source_date": "YYYY-MM-DD or unknown",
  "source_type": "contract|email|drawing|invoice|schedule|report|other",
  "sha256": "64 lowercase hex characters or null",
  "context_checked": true,
  "notes": "Why this supports, contradicts, or fails to establish the claim"
}
```

Reject an evidence item as proof when `context_checked` is false, the file cannot be opened, or the hash/path is absent. It may remain as an explicitly labeled lead.
