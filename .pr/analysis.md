# Investigation notes (2026-08-27)

Commands used:

```bash
git fetch origin perso dev
git log --oneline origin/main..origin/perso
git log --oneline origin/perso..origin/main | head
git ls-tree -r --name-only origin/perso | rg -i 'FORK|forbid-prs|quantum-agent'
gh api repos/fvegiard/OpenHands --jq .default_branch
gh pr view 55 --json mergeable_state,baseRefName,headRefName
```

Results:

- default_branch: `main`
- perso unique commits: eef193f24, f1f0284bd, 6f1f43b18
- main is Agent Canvas; perso still has `openhands/` + `frontend/`
- PR 55 mergeable_state: dirty
