# Tailscale Inventory Agent Mode

Goal: use OpenHands/Codex as an operator that inventories reachable Tailscale machines from a local workspace without exposing Tailscale credentials in GitHub.

## Safety boundary

GitHub access alone cannot list a tailnet. The agent must run on a machine already authenticated to Tailscale.

Do not commit these files:

- `tailscale-status.json`
- `tailscale-debug.json`
- auth keys
- machine keys
- OAuth secrets
- ACL files containing private user/group structure unless intentionally versioned

## Agent roles

1. `repo-agent`: pulls `fvegiard/OpenHands` and verifies the script exists.
2. `env-agent`: checks Python and Tailscale CLI availability.
3. `tailscale-agent`: runs `tailscale status --json` locally.
4. `parser-agent`: runs `scripts/tailscale/list_machines.py`.
5. `security-agent`: identifies exit nodes, subnet routers, offline machines, and tagged devices.
6. `openhands-agent`: maps machines suitable for OpenHands workers.
7. `codex-agent`: maps machines suitable for Codex/CLI workloads.
8. `report-agent`: writes a sanitized inventory report.

## Local execution

```bash
git clone https://github.com/fvegiard/OpenHands.git
cd OpenHands
python --version
tailscale version
tailscale status --json > tailscale-status.json
python scripts/tailscale/list_machines.py tailscale-status.json
```

## Expected output

```text
online | name | ip | os | exit | subnet | tags | dns
...
Summary: X/Y online, A exit node(s), B subnet router(s).
```

## Sanitized report command

```bash
mkdir -p reports/tailscale
python scripts/tailscale/list_machines.py tailscale-status.json > reports/tailscale/inventory.txt
```

Review the report before committing. Do not commit raw `tailscale-status.json`.
