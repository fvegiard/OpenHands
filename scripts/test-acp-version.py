"""Sandbox test: run Claude Code ACP at a bumped version before changing the pin.

Usage:
    1. Robocopy the installed ``openhands`` package into a sandbox dir, e.g.::

           robocopy <site-packages>\\openhands sandbox-acp\\openhands /E /NFL /NDL

    2. Edit ``sandbox-acp\\openhands\\sdk\\settings\\acp_install_catalog.py`` and
       bump ``CLAUDE_AGENT_ACP_VERSION`` to the candidate version.

    3. Place this script inside the sandbox dir and run it with the SDK's
       Python (the uvx ephemeral env) so all other dependencies resolve::

           uv run --with openhands-sdk python scripts\\test-acp-version.py [expected-version]

       or point ``OH_SDK_SITE_PACKAGES`` at the env's site-packages and use any
       Python 3.12+.

The sandbox dir is inserted as the first ``sys.path`` entry so its copy of the
SDK shadows the installed one; the real env's site-packages is appended for
everything else. The test passes when the pinned version matches, the ACP
server initializes, and Claude Code replies to a prompt (FINISHED status).

See docs/ACP_WINDOWS_DEV.md for the full procedure.
"""

import os
import sys
from pathlib import Path

SANDBOX = Path(__file__).resolve().parent
EXPECTED_VERSION = sys.argv[1] if len(sys.argv) > 1 else None


def find_sdk_site_packages() -> Path:
    """Locate the uvx ephemeral env's site-packages containing openhands-sdk."""
    env_override = os.environ.get("OH_SDK_SITE_PACKAGES")
    if env_override:
        return Path(env_override)
    # Normal case: this script runs with the SDK's own Python already.
    import site

    for sp in site.getsitepackages():
        if (Path(sp) / "openhands" / "sdk").is_dir():
            return Path(sp)
    # Fallback: newest uv cache archive that carries the SDK (Windows layout).
    cache = Path.home() / "AppData" / "Local" / "uv" / "cache" / "archive-v0"
    candidates = sorted(
        (p for p in cache.glob("*/Lib/site-packages") if (p / "openhands" / "sdk").is_dir()),
        key=os.path.getmtime,
        reverse=True,
    )
    if candidates:
        return candidates[0]
    raise SystemExit(
        "Could not locate openhands-sdk site-packages. "
        "Set OH_SDK_SITE_PACKAGES or run with the SDK's Python."
    )


sys.path.insert(0, str(SANDBOX))
sys.path.append(str(find_sdk_site_packages()))

from openhands.sdk.settings import acp_install_catalog as catalog  # noqa: E402

print(f"Catalog loaded from: {catalog.__file__}")
print(f"Pinned CLAUDE_AGENT_ACP_VERSION: {catalog.CLAUDE_AGENT_ACP_VERSION}")
assert str(SANDBOX) in str(catalog.__file__), "NOT using the sandbox SDK copy!"
if EXPECTED_VERSION:
    assert catalog.CLAUDE_AGENT_ACP_VERSION == EXPECTED_VERSION, (
        f"sandbox pin {catalog.CLAUDE_AGENT_ACP_VERSION} != expected {EXPECTED_VERSION}"
    )

from openhands.sdk import Conversation  # noqa: E402
from openhands.sdk.event.llm_convertible import MessageEvent  # noqa: E402
from openhands.sdk.settings import ACPAgentSettings  # noqa: E402

settings = ACPAgentSettings(acp_server="claude-code", acp_prompt_timeout=300.0)
agent = settings.create_agent()
print(f"Resolved acp_command: {agent.acp_command}")

workspace = SANDBOX / "workspace"
workspace.mkdir(exist_ok=True)

replies: list[str] = []


def on_event(event) -> None:
    etype = type(event).__name__
    print(f"EVENT: {etype} source={getattr(event, 'source', '?')}")
    if isinstance(event, MessageEvent) and str(event.source) == "agent":
        text = "".join(c.text for c in event.llm_message.content if hasattr(c, "text"))
        if text.strip():
            replies.append(text)
            print(f"AGENT REPLY: {text[:500]}")
    elif etype == "ActionEvent":
        # ACP agents deliver their final answer as a Finish action, not a
        # MessageEvent — capture it so the verdict sees the reply text.
        action = getattr(event, "action", None)
        blob = str(action) if action is not None else str(event)
        if blob:
            replies.append(blob)
            print(f"AGENT ACTION: {blob[:300]}")


conv = Conversation(agent=agent, workspace=str(workspace), callbacks=[on_event])
conv.send_message("Reply with exactly: ACP-OK")
conv.run()

print(f"CONVERSATION STATUS: {conv.state.execution_status}")
print(f"RESULT: replies={len(replies)}")
print("SANDBOX TEST PASSED" if replies else "SANDBOX TEST FAILED: no reply")
