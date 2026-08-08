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

## Branch-introduced items (must be green — they are)

These were introduced by the provider branch (not base) and are fixed:

- `biome.json` `$schema` `2.4.15` → `2.5.7`; removed deprecated
  `linter.rules.recommended` (recommended rules still enforced).
- `src/providers/registry.ts`: removed unused `existsSync` import.
- `biome check .` → **0 warnings, 0 infos**; CI runs `biome check` only (never `--write`).
