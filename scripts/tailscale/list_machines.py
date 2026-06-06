#!/usr/bin/env python3
"""
Interpret `tailscale status --json` and print a concise machine inventory.

Usage:
  tailscale status --json | python scripts/tailscale/list_machines.py
  python scripts/tailscale/list_machines.py tailscale-status.json

This script does not authenticate to Tailscale. It only parses local JSON output.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def load_payload() -> dict[str, Any]:
    if len(sys.argv) > 1:
        return json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if not raw:
        raise SystemExit(
            "No input. Run: tailscale status --json | python scripts/tailscale/list_machines.py"
        )
    return json.loads(raw)


def bool_mark(value: bool) -> str:
    return "yes" if value else "no"


def machine_rows(payload: dict[str, Any]) -> list[dict[str, str]]:
    peers = payload.get("Peer") or {}
    rows: list[dict[str, str]] = []

    self_node = payload.get("Self")
    if isinstance(self_node, dict):
        peers = {"SELF": self_node, **peers}

    for key, peer in peers.items():
        if not isinstance(peer, dict):
            continue

        tags = peer.get("Tags") or []
        capabilities = peer.get("CapMap") or {}
        tailscale_ips = peer.get("TailscaleIPs") or []
        allowed_ips = peer.get("AllowedIPs") or []

        is_exit_node = any(ip in {"0.0.0.0/0", "::/0"} for ip in allowed_ips)
        is_subnet_router = any("/" in ip and ip not in {"0.0.0.0/0", "::/0"} for ip in allowed_ips)

        rows.append(
            {
                "name": str(peer.get("HostName") or peer.get("DNSName") or key),
                "dns": str(peer.get("DNSName") or ""),
                "ip": ", ".join(map(str, tailscale_ips)),
                "online": bool_mark(bool(peer.get("Online"))),
                "os": str(peer.get("OS") or ""),
                "user": str(peer.get("UserID") or ""),
                "exit": bool_mark(is_exit_node),
                "subnet": bool_mark(is_subnet_router),
                "tags": ", ".join(map(str, tags)),
                "capabilities": ", ".join(sorted(map(str, capabilities.keys()))),
            }
        )

    return sorted(rows, key=lambda row: (row["online"] != "yes", row["name"].lower()))


def print_table(rows: list[dict[str, str]]) -> None:
    columns = ["online", "name", "ip", "os", "exit", "subnet", "tags", "dns"]
    widths = {col: max(len(col), *(len(row[col]) for row in rows)) for col in columns}

    print(" | ".join(col.ljust(widths[col]) for col in columns))
    print("-+-".join("-" * widths[col] for col in columns))
    for row in rows:
        print(" | ".join(row[col].ljust(widths[col]) for col in columns))


def main() -> None:
    payload = load_payload()
    rows = machine_rows(payload)
    if not rows:
        raise SystemExit("No machines found in Tailscale JSON payload.")

    print_table(rows)

    online = sum(row["online"] == "yes" for row in rows)
    exit_nodes = sum(row["exit"] == "yes" for row in rows)
    subnet_routers = sum(row["subnet"] == "yes" for row in rows)
    print()
    print(f"Summary: {online}/{len(rows)} online, {exit_nodes} exit node(s), {subnet_routers} subnet router(s).")


if __name__ == "__main__":
    main()
