"""mavis-bridge.openclaw_m3 — the OpenAgent ↔ Mavis bridge package.

This package contains the runtime glue that makes All-Hands-AI/OpenHands
run as a Mavis plugin:

  * `mcp_server`    — FastMCP stdio server exposing OpenHands tools to Mavis
  * `agent_bridge`  — context-sync between Mavis sessions and OpenHands runs
  * `manifest`      — read/write helpers for .minimax-plugin/manifest.json
  * `runtime`       — thin wrapper around the OpenHands HTTP API
  * `telemetry`     — writes session events to the Mavis `openagent-bridge`
                     memory topic for cross-session continuity.

Upstream:  https://github.com/All-Hands-AI/OpenHands
Plugin:    https://github.com/fvegiard/OpenHands  (branch: dev/mavis-plugin)
"""

from .agent_bridge import AgentBridge, BridgeState
from .manifest import PluginManifest, load_manifest, find_manifest

__all__ = ["AgentBridge", "BridgeState", "PluginManifest", "load_manifest", "find_manifest"]
__version__ = "1.0.0"
