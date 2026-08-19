"""Tests for mavis-bridge.openclaw_m3 — runnable in any Python 3.11+ env.

Run:
    cd /workspace/oh-mavis-work && python -m unittest mavis-bridge.tests.test_bridge -v
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

# allow `python -m unittest` from the project root
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from mavis_bridge.openclaw_m3.agent_bridge import AgentBridge  # noqa: E402
from mavis_bridge.openclaw_m3.manifest import PluginManifest, load_manifest  # noqa: E402
from mavis_bridge import skills_sync  # noqa: E402


class TestAgentBridge(unittest.IsolatedAsyncioTestCase):
    async def test_initialize_returns_stable_session_id(self):
        b = AgentBridge(workspace_uri="/tmp", mavis_session_id="sess-1")
        sid1 = await b.initialize_bridge()
        sid2 = await b.initialize_bridge()  # idempotent
        self.assertEqual(sid1, sid2)
        self.assertTrue(sid1.startswith("oh_ag_"))

    async def test_synchronize_context_idempotent(self):
        b = AgentBridge(workspace_uri="/tmp", mavis_session_id="sess-2")
        await b.initialize_bridge()
        first = await b.synchronize_context({"active_skills": ["github"]})
        second = await b.synchronize_context({"active_skills": ["github"]})
        self.assertTrue(first)
        self.assertFalse(second)

    async def test_synchronize_context_updates_state(self):
        b = AgentBridge(workspace_uri="/tmp", mavis_session_id="sess-3")
        await b.initialize_bridge()
        await b.synchronize_context({"active_skills": ["github", "docker"]})
        snap = b.snapshot()
        self.assertEqual(set(snap["active_skills"]), {"github", "docker"})
        self.assertGreater(snap["last_sync_ts"], 0)


class TestManifest(unittest.TestCase):
    def test_load_manifest_from_this_repo(self):
        # the manifest is one level up from the package
        candidate = HERE.parent.parent / ".minimax-plugin" / "manifest.json"
        if not candidate.exists():
            self.skipTest(f"manifest not present at {candidate}")
        m = load_manifest(candidate)
        self.assertEqual(m.name, "openagent")
        self.assertGreater(len(m.skills), 0)
        self.assertGreater(len(m.mcp_servers), 0)

    def test_manifest_roundtrip(self):
        m = PluginManifest.from_dict(
            {
                "schemaVersion": 1,
                "name": "demo",
                "displayName": "Demo",
                "version": "0.1.0",
                "description": "x",
                "category": "Test",
                "skills": ["a", "b"],
                "mcpServers": [],
                "exampleQueries": [],
            }
        )
        self.assertEqual(m.name, "demo")
        self.assertEqual(m.skills, ["a", "b"])


class TestSkillsSync(unittest.TestCase):
    def test_convert_single_skill(self):
        with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
            src_path = Path(src)
            (src_path / "github.md").write_text(
                "---\n"
                "name: github\n"
                "type: knowledge\n"
                "version: 1.0.0\n"
                "agent: CodeActAgent\n"
                "triggers:\n"
                "  - github\n"
                "  - git\n"
                "---\n\n"
                "Use the GitHub API to triage issues.\n",
                encoding="utf-8",
            )
            written = skills_sync.convert_dir(src_path, Path(dst))
            self.assertEqual(len(written), 1)
            out_text = written[0].read_text(encoding="utf-8")
            self.assertIn("name: github", out_text)
            self.assertIn("Triggers: github, git", out_text)
            self.assertIn("Use the GitHub API", out_text)


if __name__ == "__main__":
    unittest.main()
