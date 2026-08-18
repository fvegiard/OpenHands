#!/usr/bin/env bash
# Porte unique avant push — même tranche que le CI.
set -euo pipefail
cd "$(dirname "$0")/.."
make -C mcp-servers verifier
echo "OK to push"
