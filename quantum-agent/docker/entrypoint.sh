#!/usr/bin/env bash
set -euo pipefail

# Hydrate the toolchain from the workspace .mise.toml (no-op if already done).
if [[ -f .mise.toml ]]; then
  mise install || true
  eval "$(mise activate bash || true)"
fi

# Install Node deps if missing.
if [[ -f package.json && ! -d node_modules ]]; then
  pnpm install --frozen-lockfile || pnpm install
fi

exec "$@"
