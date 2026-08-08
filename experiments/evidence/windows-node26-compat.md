# Base-vs-head evidence: Windows 11 / Node 26 compatibility

Runtime (identical for base and head): **Windows 11, Node v26.7.0, npm 12.0.2,
repo-pinned pnpm 10.18.2**. Frozen install, `tsc`, provider tests, full Vitest.

## RED baseline (unchanged base `1f43ce8112653f1f05e5b6bf0caf1534beb6114d`)

Operator-confirmed at the frozen base under the same Windows/Node 26 runtime:
**4 tests fail** (79 passed / 4 failed):

1. `test/permissions.test.ts` — "allows edits inside the project root" (path containment)
2. `test/init-and-sources.test.ts` — `install('pack:default')` (5s timeout)
3. `test/init-and-sources.test.ts` — `accepts type = "filesystem"` (filesystem alias)
4. `test/init-and-sources.test.ts` — "parses the `[packs]` table" ([packs] parsing)

These reproduce at base, so they are **pre-existing base defects, not caused by
the provider work.**

## Attribution (deterministic, reproducible)

```
BASE=1f43ce8112653f1f05e5b6bf0caf1534beb6114d
# The defect files were IDENTICAL to base at the provider governance commit b7a84b1f4:
git diff --quiet $BASE b7a84b1f4 -- quantum-agent/src/permissions.ts            # identical
git diff --quiet $BASE b7a84b1f4 -- quantum-agent/test/permissions.test.ts      # identical
git diff --quiet $BASE b7a84b1f4 -- quantum-agent/src/skills/sources.ts         # identical
git diff --quiet $BASE b7a84b1f4 -- quantum-agent/test/init-and-sources.test.ts # identical
# Only the Windows-fix commits touch them afterwards:
git log --oneline $BASE..HEAD -- quantum-agent/src/permissions.ts   # 1ef2df6cd
git log --oneline $BASE..HEAD -- quantum-agent/src/skills/sources.ts # 1ef2df6cd
git log --oneline $BASE..HEAD -- quantum-agent/test/init-and-sources.test.ts # b12afbd47
```

`quantum-agent/src/skills/manager.ts` differs from base only by an **unrelated**
`syncSkills` addition (`70edd0a4a`); the `installGh` live-clone that caused the
`pack:default` timeout is base code, fixed in `b12afbd47`.

## Fixes (head) — real cross-platform/Node26 repairs, no assertions weakened

| Defect | Fix | Commit |
|---|---|---|
| permissions path containment (hardcoded `/`) | `path.relative` + `isAbsolute` | `1ef2df6cd` |
| filesystem alias / `[packs]` parsing (`startsWith("/")`) | `path.isAbsolute` | `1ef2df6cd` |
| `pack:default` clone hang | `GIT_TERMINAL_PROMPT=0` / `GCM_INTERACTIVE=never` | `1ef2df6cd` |
| `pack:default` 5s timeout (live network) | `QUANTUM_SKILLS_OFFLINE` hermetic mode in the pack tests (assertions unchanged; ~6ms) | `b12afbd47` |

## GREEN (head) — CI on the exact platform

- `quantum / green-windows-node26-compat` (windows-latest, Node 26): **FAILED at
  `6c4ea99f3`** (`1 failed | 82 passed`, `init-and-sources … Test timed out in
  5000ms`) → **SUCCESS at `b12afbd47`** (83/83).
- `quantum / green` (Node 22.12 Linux, required) and `green-node26-compat`
  (Node 26 Linux): 20 files / **83 tests** green.

## Pinned runtime (deterministic install — no floating major)

The stable default lane pins an **exact** Node version; a floating `"22"` would
violate the deterministic-install contract and is not used.

| Setting | Value | Where |
|---|---|---|
| Stable lane Node (exact) | **`22.23.2`** (Node 22 LTS; archive updated 2026-07-28) | `.github/workflows/quantum.yml` `green` job `node-version` |
| Engine minimum | **`>=22.13.0`** (first unflagged `node:sqlite`) | `quantum-agent/package.json` `engines.node` |
| Package manager | `pnpm@10.18.2` (repo-pinned) | `pnpm/action-setup@v6` |
| Compat lanes (non-default) | Node `26` (Linux + Windows) | `green-node26-compat`, `green-windows-node26-compat` |
| Pinned since | commit `a16c6fbe9` | — |

The exact 22.12.0 patch is intentionally NOT used (it lacks unflagged
`node:sqlite`); we do not add `--experimental-sqlite`.

## Node 26 platform verdicts (kept separate — no universal-support claim)

Node 26 is a **compatibility lane**, not the supported default (that is Node 22
LTS `22.23.2`, engine floor `>=22.13.0`). Verdicts are recorded per platform and
per SHA; they are not generalized across platforms.

| Platform | SHA | Verdict | Evidence |
|---|---|---|---|
| **Node 26 Linux** | `12f56684` | **VERIFIED** | `green-node26-compat` job 93148486329 (run 31275589712) SUCCESS: identical frozen install + Biome + `tsc` + full Vitest + README verify |
| **Node 26 Windows** | `12f56684` | **NOT VERIFIED** | frozen base `1f43ce8` and head `12f56684` both reproduce the 4 Windows/path/network-sensitive failures above (fixes landed later) |
| Node 26 Windows | `b12afbd47` (later) | VERIFIED | `green-windows-node26-compat` SUCCESS after the cross-platform fixes (recorded above); does not retroactively change the `12f56684` verdict |

"Node 26 Linux VERIFIED" does **not** imply "Node 26 Windows VERIFIED." The two
lanes are evaluated independently.

## Branch-introduced items (must be green — they are)

These were introduced by the provider branch (not base) and are fixed:

- `biome.json` `$schema` `2.4.15` → `2.5.7`; removed deprecated
  `linter.rules.recommended` (recommended rules still enforced).
- `src/providers/registry.ts`: removed unused `existsSync` import.
- `biome check .` → **0 warnings, 0 infos**; CI runs `biome check` only (never `--write`).
