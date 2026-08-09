# Lane transcript

- agent/model/runtime: `cursor` / `gpt-5-class` / `cursor-cloud`
- branch/base/head: `agent/release-candidate-autonomy` / `1f43ce811` / `74e52f291`
- contract bundle sha256: `fd50d17f927fa9e8a32ed24ed0bd78ecd74fdc132f8665656702143c73518473`
- rubric sha256: `3b3431ca675e90747980674703818974a9593b890a0c8b5869d5531f43f578af`

| seq | ts | type | detail |
|---|---|---|---|
| 1 | 2026-08-09T03:14:43Z | run_start | contract `fd50d17f927f` |
| 2 | 2026-08-09T03:14:43Z | contract_ack | contract `fd50d17f927f` |
| 3 | 2026-08-09T03:14:43Z | message | **agent**: Acknowledged contract bundle fd50d17f927f; running acceptance harness for lane synthesis. |
| 4 | 2026-08-09T03:15:06Z | command | `python.exe experiments/harness/run_acceptance.py --lane synthesis --out 'experiments\lanes\synthesis\results-synthesis.json'` (cwd `.`) exit=0 out=`01ee3f5dcfbe` |
| 5 | 2026-08-09T03:15:06Z | artifact | `experiments\lanes\synthesis\results-synthesis.json` sha256=`087195963321` bytes=13063 |
| 6 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum --help` (cwd `quantum-agent`) exit=0 out=`b9c1a622cc08` |
| 7 | 2026-08-09T03:15:06Z | test | t01-cli-help [real]: passed=1 failed=0 skipped=0 |
| 8 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum provider list` (cwd `quantum-agent`) exit=0 out=`ae985dcb5cd0` |
| 9 | 2026-08-09T03:15:06Z | test | t02-provider-list [real]: passed=1 failed=0 skipped=0 |
| 10 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum provider status` (cwd `quantum-agent`) exit=0 out=`b206dabae01d` |
| 11 | 2026-08-09T03:15:06Z | test | t03-provider-status [real]: passed=1 failed=0 skipped=0 |
| 12 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum provider test` (cwd `quantum-agent`) exit=0 out=`d008de51d700` |
| 13 | 2026-08-09T03:15:06Z | test | t04-provider-test-diagnostic [real]: passed=1 failed=0 skipped=0 |
| 14 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum provider status` (cwd `quantum-agent`) exit=0 out=`13ae9694d91e` |
| 15 | 2026-08-09T03:15:06Z | test | t05-provider-switch [real]: passed=1 failed=0 skipped=0 |
| 16 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum provider status` (cwd `quantum-agent`) exit=1 out=`7bd26f3c59e3` |
| 17 | 2026-08-09T03:15:06Z | test | t06-invalid-runtime-errors [real]: passed=1 failed=0 skipped=0 |
| 18 | 2026-08-09T03:15:06Z | command | `python.exe experiments/harness/skill_lint.py` (cwd `.`) exit=0 out=`baa4ad9b9dec` |
| 19 | 2026-08-09T03:15:06Z | test | t07-skill-validate [real]: passed=1 failed=0 skipped=0 |
| 20 | 2026-08-09T03:15:06Z | test | t08-skill-forward-1 [presence]: passed=0 failed=0 skipped=1 |
| 21 | 2026-08-09T03:15:06Z | test | t09-skill-forward-2 [presence]: passed=0 failed=0 skipped=1 |
| 22 | 2026-08-09T03:15:06Z | test | t10-self-heal-recovery [presence]: passed=0 failed=0 skipped=1 |
| 23 | 2026-08-09T03:15:06Z | command | `pnpm.CMD quantum verify` (cwd `quantum-agent`) exit=0 out=`2c0877114f57` |
| 24 | 2026-08-09T03:15:06Z | test | t11-verify-contract [real]: passed=1 failed=0 skipped=0 |
| 25 | 2026-08-09T03:15:06Z | command | `wsl.exe --exec bash -lc 'set -euo pipefail; export GIT_DIR=$USER_HOME/codex/Documents/Codex/2026-08-08/loo/work/OpenHands-orchestrator/.git/worktrees/openhands-cursor-final-4f2cd1c6; export GIT_WORK_TREE=$USER_HOME/codex/Documents/Codex/2026-08-08/loo/work/openhands-cursor-final-4f2cd1c6; cd $USER_HOME/codex/Documents/Codex/2026-08-08/loo/work/openhands-cursor-final-4f2cd1c6; bash scripts/test-openhands-cloud.sh'` (cwd `.`) exit=0 out=`ec5221869a77` |
| 26 | 2026-08-09T03:15:06Z | test | t12-doctor-report [real]: passed=1 failed=0 skipped=0 |
| 27 | 2026-08-09T03:15:06Z | test | t13-resume [presence]: passed=0 failed=0 skipped=1 |
| 28 | 2026-08-09T03:15:06Z | test | t14-live-provider-call [live]: passed=0 failed=0 skipped=1 |
| 29 | 2026-08-09T03:15:06Z | verdict | **PASS** backed_by=[7, 9, 11, 13, 15, 17, 19, 24, 26] |
