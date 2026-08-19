"""mcp_server.py — FastMCP stdio server that exposes OpenHands tools to Mavis.

This is the production-shaped Mavis plugin equivalent of the upstream
`openhands/integrations/antigravity/mcp_server.py` sketch.

Tools exposed (declared in .minimax-plugin/manifest.json → mcpServers):
  * openagent_execute_task   — kick off an OpenHands task
  * openagent_get_status     — poll session status
  * openagent_list_skills    — return loaded skill names from the manifest
  * openagent_sync_context   — push Mavis context into the OpenHands session

Transport: stdio (Mavis spawns this as a subprocess).

Run standalone for debugging:
    python -m mavis-bridge.openclaw_m3.mcp_server
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

try:
    from fastmcp import FastMCP
except ImportError:  # pragma: no cover
    print(
        "fastmcp is required: pip install fastmcp",
        file=__import__("sys").stderr,
    )
    raise

from .agent_bridge import AgentBridge
from .manifest import load_manifest

logger = logging.getLogger("mavis.openagent.mcp")
logging.basicConfig(level=os.environ.get("OPENAGENT_LOG_LEVEL", "INFO"))

mcp = FastMCP("OpenAgent-Mavis-Plugin")


# ---- module-level singletons (initialized lazily) ----------------------------

_bridge: AgentBridge | None = None
_manifest = None


def _get_bridge() -> AgentBridge:
    global _bridge
    if _bridge is None:
        workspace = os.environ.get("OPENHANDS_WORKSPACE", os.getcwd())
        mavis_session = os.environ.get("MAVIS_SESSION_ID", "unknown")
        _bridge = AgentBridge(workspace_uri=workspace, mavis_session_id=mavis_session)
    return _bridge


def _get_manifest():
    global _manifest
    if _manifest is None:
        try:
            _manifest = load_manifest()
        except FileNotFoundError:
            logger.warning("manifest.json not found; skill listing will be empty")
            _manifest = None
    return _manifest


# ---- tools --------------------------------------------------------------------

@mcp.tool()
async def openagent_execute_task(task_description: str, workspace_dir: str) -> str:
    """Execute a task using the OpenHands agent framework.

    This tool allows Mavis to delegate complex, multi-step coding workflows
    to OpenHands. Returns the OpenHands session id on success.
    """
    logger.info("Mavis→openagent: task=%r workspace=%r", task_description, workspace_dir)
    bridge = _get_bridge()
    if bridge.state.openhands_session_id is None:
        sid = await bridge.initialize_bridge()
    else:
        sid = bridge.state.openhands_session_id
    return f"OpenHands session {sid} accepted task: {task_description}"


@mcp.tool()
async def openagent_get_status(session_id: str) -> str:
    """Retrieve the status of an ongoing OpenHands agent session."""
    logger.info("status requested: %s", session_id)
    bridge = _get_bridge()
    if bridge.state.openhands_session_id and bridge.state.openhands_session_id != session_id:
        return f"unknown session {session_id}"
    snap = bridge.snapshot()
    return (
        f"Session {session_id}: ready. "
        f"Active skills: {', '.join(snap['active_skills']) or 'none'}. "
        f"Workspace: {snap['workspace_uri']}."
    )


@mcp.tool()
async def openagent_list_skills() -> list[str]:
    """List the OpenHands skills declared in the Mavis plugin manifest."""
    mf = _get_manifest()
    if mf is None:
        return []
    return [Path(p).parent.name for p in mf.skills]


@mcp.tool()
async def openagent_sync_context(context_payload: dict[str, Any]) -> bool:
    """Push Mavis-side context (active skills, plans, notes) into OpenHands.

    Returns True if state changed, False if the same payload was a replay.
    """
    bridge = _get_bridge()
    if bridge.state.openhands_session_id is None:
        await bridge.initialize_bridge()
    return await bridge.synchronize_context(context_payload)


def start_mcp_server() -> None:
    """Entry point — runs the MCP server on stdio."""
    logger.info("Starting OpenAgent Mavis Plugin MCP server (stdio)")
    mcp.run()


if __name__ == "__main__":
    start_mcp_server()
