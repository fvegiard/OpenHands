#!/usr/bin/env bash
# install.sh — install the openagent Mavis plugin in a Mavis runtime.
#
# Usage:
#   ./install.sh                       # install into current Mavis runtime
#   ./install.sh --runtime /path/to/mavis  # install into a different runtime
#   ./install.sh --symlink-only        # just symlink the plugin dir (no Python)
#
# What it does:
#   1. Symlink the .minimax-plugin/ dir into the Mavis plugin dir
#      (default: $MAVIS_RUNTIME/.plugin-cache, falls back to ./plugin-cache)
#   2. Install Python deps for mavis-bridge (fastmcp, pyyaml)
#   3. Run a smoke test (load manifest, list 1 skill, init bridge)
#
# Requires: bash 4+, python 3.11+, pip

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${MAVIS_RUNTIME:-$HOME/.mavis}"
PLUGIN_DIR="$RUNTIME_DIR/.plugin-cache"
SYMLINK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime) RUNTIME_DIR="$2"; PLUGIN_DIR="$RUNTIME_DIR/.plugin-cache"; shift 2;;
    --symlink-only) SYMLINK_ONLY=1; shift;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# //;s/^#//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

echo "==> openagent plugin install"
echo "    source: $HERE"
echo "    runtime: $RUNTIME_DIR"
echo "    plugin cache: $PLUGIN_DIR"

# 1. Symlink the .minimax-plugin/ directory
mkdir -p "$PLUGIN_DIR"
TARGET="$PLUGIN_DIR/openagent-mavis"
if [[ -L "$TARGET" || -e "$TARGET" ]]; then
  echo "    removing existing target: $TARGET"
  rm -rf "$TARGET"
fi
ln -s "$HERE" "$TARGET"
echo "    symlinked: $TARGET -> $HERE"

if [[ "$SYMLINK_ONLY" -eq 1 ]]; then
  echo "==> symlink-only mode, skipping Python install"
  exit 0
fi

# 2. Python deps
echo "==> installing Python deps"
python3 -m pip install --quiet --user fastmcp pyyaml 2>&1 | tail -5 || true

# 3. Smoke test
echo "==> smoke test"
cd "$HERE"
python3 -c "
import sys; sys.path.insert(0, '.')
from mavis_bridge.openclaw_m3.manifest import load_manifest
from mavis_bridge.openclaw_m3.agent_bridge import AgentBridge
import asyncio

m = load_manifest('.minimax-plugin/manifest.json')
print(f'  manifest: {m.display_name} v{m.version} ({len(m.skills)} skills)')

async def main():
    b = AgentBridge(workspace_uri='$HERE', mavis_session_id='install-smoke')
    sid = await b.initialize_bridge()
    changed = await b.synchronize_context({'active_skills': m.skills[:1]})
    print(f'  bridge: {sid} synced={changed}')

asyncio.run(main())
print('  OK')
"

echo "==> done. Restart your Mavis runtime to pick up the plugin."
