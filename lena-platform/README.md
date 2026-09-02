# Léna AI control plane

This directory is the source-controlled integration layer that turns the existing Léna persona into a bounded orchestration system.

## Runtime roles

- **Léna** owns mission framing, routing, approvals, outcome quality, and final receipts.
- **43 specialists** are versioned role definitions selected per task; they do not run permanently.
- **Luna workers** are ephemeral reader, builder, tester, reviewer, and operator workers executed through OpenHands/ACP backends.
- **n8n** handles deterministic event workflows, approvals, retries, and failure routing.
- **Supabase** stores tenant-scoped state, task envelopes, events, evidence metadata, receipts, and the canonical RAG index.
- **Cloudflare Worker** verifies public webhooks, blocks replay, and queues normalized events.
- **Tailscale** provides private access to the VM and worker mesh; it is not the public webhook boundary.

## Repository boundary

OpenHands Agent Canvas is the frontend. Agent-server changes belong in `OpenHands/software-agent-sdk`; reusable skills, automations, and MCP integrations belong in `OpenHands/extensions`. This fork carries the integration overlay, schemas, deploy manifests, and bootstrap scripts without hiding that upstream separation.

## Safety defaults

- Dedicated feature branches only; no force push and no direct push to `main`.
- Read-first tools; writes require a task-scoped approval token.
- Single writer per task and an independent reviewer for consequential changes.
- Every external effect receives an idempotency key and execution receipt.
- Secrets are environment references only and are never committed.
- Production Supabase migrations and public deployment remain explicit gates.

## Layout

- `agents/`: 43-specialist registry and Luna worker profiles.
- `orchestrator/`: deterministic routing and task-contract code.
- `mcp-electrical/`: company-wide electrical MCP server.
- `cloudflare-webhook/`: HMAC/replay-safe webhook ingress and queue consumer.
- `n8n/`: importable workflows.
- `supabase/`: additive, reversible database migration.
- `deploy/`: Docker Compose and environment contract for a Linux VM.
- `scripts/`: validation and guarded auto-commit/push.
- `docs/`: architecture, threat model, operating runbook, and sources.

## Validation

```bash
python -m unittest discover -s lena-platform/tests -v
node --test lena-platform/cloudflare-webhook/test/*.test.mjs
python lena-platform/scripts/validate_platform.py
```
