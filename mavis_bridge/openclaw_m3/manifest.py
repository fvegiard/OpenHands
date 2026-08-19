"""manifest.py — read/write the .minimax-plugin/manifest.json for the openagent plugin.

Why a separate helper: the Mavis plugin loader (in /workspace/.plugin-cache)
expects a `manifest.json` with `schemaVersion: 1`, but the file is also the
source of truth for tooling (the MCP server reads it to know which skills to
advertise, the install script reads it to know the version, etc.).

The loader is lenient — a missing file means "no plugin" — but having a typed
helper makes the bridge code testable without spinning up a full Mavis runtime.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

PLUGIN_DIR_NAME = ".minimax-plugin"
MANIFEST_FILENAME = "manifest.json"


@dataclass
class PluginManifest:
    schema_version: int
    name: str
    display_name: str
    version: str
    description: str
    category: str
    example_queries: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    mcp_servers: list[dict[str, Any]] = field(default_factory=list)
    apps: list[dict[str, Any]] = field(default_factory=list)
    source: dict[str, Any] = field(default_factory=dict)
    mavis: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PluginManifest":
        return cls(
            schema_version=int(data.get("schemaVersion", 1)),
            name=data.get("name", ""),
            display_name=data.get("displayName", ""),
            version=data.get("version", "0.0.0"),
            description=data.get("description", ""),
            category=data.get("category", ""),
            example_queries=list(data.get("exampleQueries", [])),
            skills=list(data.get("skills", [])),
            mcp_servers=list(data.get("mcpServers", [])),
            apps=list(data.get("apps", [])),
            source=dict(data.get("source", {})),
            mavis=dict(data.get("mavis", {})),
            raw=data,
        )

    def to_dict(self) -> dict[str, Any]:
        return self.raw or asdict(self)


def find_manifest(start: Path | str | None = None) -> Path | None:
    """Walk up from `start` looking for .minimax-plugin/manifest.json."""
    cur = Path(start or os.getcwd()).resolve()
    for parent in [cur, *cur.parents]:
        candidate = parent / PLUGIN_DIR_NAME / MANIFEST_FILENAME
        if candidate.is_file():
            return candidate
    return None


def load_manifest(path: Path | str | None = None) -> PluginManifest:
    """Load and parse the plugin manifest. Searches up if `path` is None."""
    p = Path(path) if path else find_manifest()
    if not p or not p.is_file():
        raise FileNotFoundError(
            f"manifest.json not found (searched up from {path or os.getcwd()})"
        )
    return PluginManifest.from_dict(json.loads(p.read_text(encoding="utf-8")))


if __name__ == "__main__":  # pragma: no cover
    import sys
    m = load_manifest()
    print(f"{m.display_name} v{m.version} ({m.category})")
    print(f"  {len(m.skills)} skills, {len(m.mcp_servers)} MCP servers")
    sys.exit(0)
