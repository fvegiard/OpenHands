# Error resolution plan (correction + debug)

Date: 2026-08-27
Repo: `fvegiard/OpenHands`
Authoring run: https://cursor.com/agents/bc-3cffdc24-0d2a-40d3-9af2-10947d11b4f9

This document is fork-only planning. It must not be merged to `main`.

## Snapshot of the fork (verified)

| Ref | SHA | What it actually is |
| --- | --- | --- |
| `origin/main` (protected, **still the GitHub default branch**) | `e95a2399e` | Agent Canvas frontend (upstream restore via PR #34). Extra vs upstream: `.github/workflows/sync-upstream.yml`. |
| `origin/perso` | `eef193f24` | **Classic Python OpenHands** (`openhands/` + `frontend/`) plus `FORK.md` / `forbid-prs-to-main.yml`. Quantum-agent tree already removed. |
| `origin/dev` | `f07558ec6` | Same fork-policy overlay as `perso`, different parent history. |
| `origin/lena-ia` | `8b1db4775` | Léna agent-profile files on **Agent Canvas** (`agents/lena-ia/`). |

`perso` and `main` are **not the same product**. `git log origin/main..origin/perso` is three fork commits on the old tree; `git log origin/perso..origin/main` is the Agent Canvas / Cloud 1.47 history. Debugging Python `openhands/app_server` or alembic `013` on current `main` is a category error: those files are gone.

## What is not broken

- Cloud agent **install**: latest doctor runs (`bc-e14cf2b5`, `bc-051aa04f`) found `INSTALL_FAILED = 0`. Setup logs exit 0. Egress unrestricted. Build `bld-20260817-53136b94-af35-493f-8947-f9d765540d6a`.
- Quantum-agent as a product: already judged inferior to real OpenHands and removed from `main` (PR #34) and from `perso`/`dev` working trees.
- Stale-runtime-profile fix (PR #33): closed on purpose after quantum-agent removal. Do not revive.

## What is broken (ordered)

### P0 — Wrong PRs and split-brain branches

1. **PR #55 `dev` → `main` is merge `dirty` and policy-illegal.**
   - Title "Dev"; empty HUMAN/AGENT template.
   - Tries to land classic-tree fork files (and delete quantum-agent) onto Agent Canvas `main`.
   - CI red is mostly **stale checks from 2026-08-18** plus Copilot failure and conventional-title failure (`Dev` is not `type(scope): …`).
   - Bugbot skipped (usage limit). Approval agent correctly **did not approve**.
   - **Correction:** close #55. Do not retarget it onto `main`. Keep `FORK.md` only on `perso`/`dev`.

2. **GitHub default branch is still `main`.**
   - `FORK.md` says default work is `perso`. Agents and Dependabot still treat `main` as default.
   - **Correction (manual GitHub):** Settings → default branch = `perso`; keep `main` protected; only `github-actions[bot]` / sync workflow may force-push `main`.

3. **Open Dependabot PRs (#32–#53) target `main` with classic-tree paths** (`containers/app`, `enterprise/`, `frontend/` as a subdir, Poetry groups). Agent Canvas `main` uses root `npm` + `.github/dependabot.yml` for `/`. Those PRs cannot apply cleanly and will keep failing.
   - **Correction:** close all Dependabot PRs whose head paths do not exist on current `main`. After default-branch change, regenerate Dependabot against the real trees (`perso` classic vs `main` canvas).

4. **PR #54 Léna IA → `main` is the one product PR that matches Agent Canvas.**
   - `npm` `test-and-build` **succeeded** on ubuntu/windows.
   - Docker Build & Push amd64/arm64 **failed** (fork registry permissions / skipped secrets — not a Léna prompt bug).
   - Mergeable `unstable`.
   - **Correction:** keep base `main` **only if** Léna is meant to live on the upstream mirror (usually no). Prefer retarget to `perso` **after** `perso` is rebuilt onto Agent Canvas (Track A below). Until then, do not merge #54 into `main` (would add fork-only agents onto the upstream mirror).

### P1 — `perso`/`dev` are frozen on the pre-restore tree

After PR #34, `main` is Agent Canvas. `perso`/`dev` still describe themselves as Python backend + React `frontend/`. Cloud agents that check out **default `main`** get Canvas; docs and automations that follow `AGENTS.md` on `perso` tell them to `make build` / Poetry / migration 013.

Dozens of leftover branches (`OMQ`, `agent/*`, `experiment/*`, `cursor/stale-runtime-profile-7805`, convoy/toast, …) still point at `eef193f24` (same as `perso`). They add CI and approval-agent noise.

**Decision gate (pick one, then execute):**

| Track | When to pick | Work |
| --- | --- | --- |
| **A — Canvas fork (recommended)** | You want this repo to match upstream OpenHands Agent Canvas, with fork policy on the side | Rebuild `perso` from current `origin/main`, cherry-pick only `FORK.md`, `forbid-prs-to-main.yml`, Dependabot `target-branch: perso`, and Léna files. Reset or archive `dev` the same way. |
| **B — Classic OSS fork** | You still need Python `openhands/` + enterprise on this GitHub repo | Stop treating `main` as the workspace default. Point cloud `environment.json` / start scripts at `perso`. Do **not** merge classic into `main`. Re-apply migration 013 / local sandbox status **on `perso` only** if those files still exist there. |

Do not mix A and B on the same branch.

### P2 — Automations and operator toil

5. **Slack doctor** cannot post to `#tous-fvegiardcursor` (`The Cursor bot is not in this channel.`). Invite the Cursor Slack bot, or change the channel, or drop the post step.
6. **PR approval agent** has no `APPROVAL_POLICY.md`, cannot assign reviewers (sole collaborator is `fvegiard`, who is the author), and treats Bugbot usage-limit as a hard no-approve. Either add a policy that distinguishes "Bugbot skipped" from "Bugbot found bugs", or stop running the approver on every Dependabot PR.
7. **Cloud AGENTS.md injection vs repo:** this VM's workspace rules still describe classic OpenHands even when the checkout is Agent Canvas `main`. After Track A or B, rewrite environment install/start so they match the chosen tree (Canvas: `npm ci` / `npm run dev`; classic: `make build` / `RUNTIME=local`).

### P3 — Product debug (only after Track A or B)

Do **not** spend time on these until the tree is chosen:

- Classic-only: SQLite alembic `013` `DuplicateColumnError`; `process_sandbox_service` treating `STATUS_SLEEPING` as down. Those were fork fixes on the old app_server; they are absent from Canvas `main`.
- Canvas Léna: load `agents/lena-ia/agent-profile.json` via Settings → Agent profiles or `POST /api/agent-profiles/lena-ia`; confirm `GET /api/agent-profiles/lena-ia` and activate. Ignore Docker push failures on the fork.
- Live LLM: still **not verified** in prior runs (no provider secret in cloud). That is config, not a code defect.

## Debug playbook (once Track A or B is chosen)

1. **Name the tree** in the first log line: `canvas` or `classic`. Refuse to apply a classic repro on canvas (and vice versa).
2. **Reproduce with a falsifiable claim**, for example: "`make run` on `perso` returns HTTP 200 from `/alive` within 60s" or "`npm test` on `main` is green".
3. **Capture baseline:** branch SHA, `git status`, failing CI job URL, one log file under `.pr/logs/`.
4. **Instrument only with runtime evidence** (debug subagent) for non-trivial bugs. No speculative app_server patches on Canvas.
5. **Fix in a `cursor/…-b4f9` branch off `perso` or `dev`.** Never push `main`.
6. **Verify:** matching unit/lint command from that tree's `AGENTS.md`, plus one end-to-end check (curl or browser).
7. **Stop conditions:** if the failure is permissions (Docker GHCR, Slack bot, Bugbot spend cap), record it as an owner action — do not invent code workarounds.

## Explicit next actions (human + agent)

**Human (cannot be done from a cloud agent alone):**

- [ ] Set default branch to `perso`.
- [ ] Confirm `main` protection + sync-only force-push.
- [ ] Invite Cursor bot to `#tous-fvegiardcursor` or disable Slack notify.
- [ ] Raise Bugbot spend cap if you want approval-agent to treat reviews as complete.
- [ ] Choose Track A or Track B.

**Next agent (after Track A is confirmed — default recommendation):**

1. Close PR #55 with a comment pointing at this plan.
2. Close stale Dependabot PRs whose paths died in the Canvas restore.
3. Rebuild `perso` from `origin/main` + overlay fork policy files.
4. Retarget Léna (#54) to `perso` and land it there.
5. Delete or archive branches still at `eef193f24` that are not `perso`.
6. Align cloud install/start with Canvas (`npm`).

**Next agent (if Track B is confirmed):**

1. Close PR #55 anyway (classic must not overwrite Canvas `main`).
2. Point cloud checkout at `perso`.
3. Re-run OSS local doctor on `perso`: Poetry install, alembic, `RUNTIME=local` conversation open.
4. Only then patch sandbox/migration if those bugs still reproduce.

## Evidence index

- PR #34 merged restore: https://github.com/fvegiard/OpenHands/pull/34
- PR #35/`perso` and #36/`dev` fork routing: merged 2026-08-18
- PR #55: https://github.com/fvegiard/OpenHands/pull/55 (`dirty`, do not merge)
- PR #54: https://github.com/fvegiard/OpenHands/pull/54 (Léna; tests green, docker push red)
- Env doctors: https://cursor.com/agents/bc-e14cf2b5-6994-420f-b495-130010c236ea
- Approval on #55: https://cursor.com/agents/bc-da50d034-5270-449b-862b-fce19003bb57
- Prior assessment (quantum, superseded): https://cursor.com/agents/bc-2e0df5ec-87e3-45cf-8620-b78652527805
- Restore/env-setup: https://cursor.com/agents/bc-d494ecc3-4bf5-4bba-aa61-0b4c531d3ed7
