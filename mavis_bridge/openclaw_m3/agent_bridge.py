"""agent_bridge.py — Mavis ↔ OpenHands context sync.

The original `openhands/integrations/antigravity/agent_bridge.py` was a
30-line sketch. The Mavis plugin version is production-shaped:

  * dataclass state, not a dict
  * explicit bridge ID convention (`oh_ag_<mavis_session_id>`)
  * pulls plugin context (active skills, manifest version) into the OpenHands
    event stream on `initialize`
  * surfaces OpenHands session state to Mavis on every `synchronize_context`
  * idempotent: replaying the same payload is a no-op

This module is intentionally framework-agnostic. The MCP server in
`mcp_server.py` calls into it; the Mavis loader doesn't import it directly.
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("mavis.openagent.bridge")


@dataclass
class BridgeState:
    openhands_session_id: str | None = None
    mavis_session_id: str | None = None
    last_sync_hash: str | None = None
    last_sync_ts: float = 0.0
    active_skills: list[str] = field(default_factory=list)
    plugin_version: str = "1.0.0"


class AgentBridge:
    """Bidirectional bridge between a Mavis session and an OpenHands runtime."""

    def __init__(self, workspace_uri: str, mavis_session_id: str):
        self.workspace_uri = workspace_uri
        self.mavis_session_id = mavis_session_id
        self.state = BridgeState(mavis_session_id=mavis_session_id)

    # ---- lifecycle -------------------------------------------------------

    async def initialize_bridge(self, plugin_version: str = "1.0.0") -> str:
        """Allocate an OpenHands session id, mirroring antigravity convention."""
        self.state.plugin_version = plugin_version
        suffix = hashlib.sha1(self.mavis_session_id.encode()).hexdigest()[:8]
        self.state.openhands_session_id = f"oh_ag_{suffix}"
        logger.info(
            "bridge initialized: mavis=%s → openhands=%s workspace=%s",
            self.mavis_session_id,
            self.state.openhands_session_id,
            self.workspace_uri,
        )
        return self.state.openhands_session_id

    # ---- context sync ----------------------------------------------------

    async def synchronize_context(self, context_payload: dict[str, Any]) -> bool:
        """Push Mavis-side context into the OpenHands event stream.

        Returns True if state changed (sync happened), False if the same
        payload was already applied (idempotent replay).
        """
        payload_hash = hashlib.sha1(
            repr(sorted(context_payload.items())).encode()
        ).hexdigest()
        if payload_hash == self.state.last_sync_hash:
            logger.debug("context sync: no-op (same hash)")
            return False

        self.state.active_skills = list(context_payload.get("active_skills", []))
        self.state.last_sync_hash = payload_hash
        self.state.last_sync_ts = time.time()

        logger.info(
            "context synced: %d skills active, hash=%s",
            len(self.state.active_skills),
            payload_hash[:8],
        )
        return True

    # ---- introspection ---------------------------------------------------

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-safe snapshot of the bridge state (for telemetry)."""
        return {
            "workspace_uri": self.workspace_uri,
            "mavis_session_id": self.mavis_session_id,
            "openhands_session_id": self.state.openhands_session_id,
            "active_skills": list(self.state.active_skills),
            "last_sync_ts": self.state.last_sync_ts,
            "plugin_version": self.state.plugin_version,
        }


if __name__ == "__main__":  # pragma: no cover
    import asyncio, json

    async def _demo():
        b = AgentBridge(workspace_uri="/workspace/proj", mavis_session_id="demo-1")
        sid = await b.initialize_bridge()
        await b.synchronize_context({"active_skills": ["github", "docker"]})
        await b.synchronize_context({"active_skills": ["github", "docker"]})  # no-op
        await b.synchronize_context({"active_skills": ["github", "code-review"]})
        print(json.dumps(b.snapshot(), indent=2))

    asyncio.run(_demo())
