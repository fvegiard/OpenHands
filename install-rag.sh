#!/usr/bin/env bash
# install-rag.sh — install Qdrant + start the Mavis RAG service.
# (See /workspace/mavis-rag/README.md for full docs.)

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QDRANT_DIR="${QDRANT_DIR:-/workspace/qdrant}"
RAG_DIR="${RAG_DIR:-/workspace/mavis-rag}"
QDRANT_VERSION="1.19.0"
QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v${QDRANT_VERSION}/qdrant-x86_64-unknown-linux-musl.tar.gz"
HTTP_PORT="${HTTP_PORT:-8088}"
QDRANT_PORT="${QDRANT_PORT:-6333}"

NO_QDRANT=0
NO_INGEST=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-qdrant) NO_QDRANT=1; shift;;
    --no-ingest) NO_INGEST=1; shift;;
    -h|--help) grep '^#' "$0" | sed 's/^# //;s/^#//'; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

echo "==> Mavis RAG install"
if [[ "$NO_QDRANT" -eq 0 ]]; then
  if [[ ! -x "$QDRANT_DIR/qdrant" ]]; then
    echo "==> downloading Qdrant v${QDRANT_VERSION}"
    mkdir -p "$QDRANT_DIR/storage" "$QDRANT_DIR/snapshots"
    curl -sL -o "$QDRANT_DIR/qdrant.tar.gz" "$QDRANT_URL"
    tar xzf "$QDRANT_DIR/qdrant.tar.gz" -C "$QDRANT_DIR"
    rm "$QDRANT_DIR/qdrant.tar.gz"
    echo "    installed: $($QDRANT_DIR/qdrant --version)"
  fi
  if ! pgrep -f "$QDRANT_DIR/qdrant" > /dev/null; then
    echo "==> starting Qdrant on :$QDRANT_PORT"
    nohup "$QDRANT_DIR/qdrant" --uri "http://0.0.0.0:$QDRANT_PORT" > "$QDRANT_DIR/qdrant.log" 2>&1 &
    sleep 3
    curl -sf -m 5 "http://127.0.0.1:$QDRANT_PORT/healthz" > /dev/null && echo "    healthy"
  fi
fi
echo "==> pip install fastembed qdrant-client pyyaml"
pip install --break-system-packages --quiet -i https://mirrors.aliyun.com/pypi/simple/ fastembed qdrant-client pyyaml 2>&1 | tail -3 || true
if [[ "$NO_INGEST" -eq 0 ]]; then
  echo "==> running ingest"
  cd "$RAG_DIR" && python3 ingest.py 2>&1 | tail -10
fi
if ! pgrep -f "$RAG_DIR/serve.py" > /dev/null; then
  echo "==> starting HTTP API on :$HTTP_PORT"
  nohup python3 "$RAG_DIR/serve.py" "$HTTP_PORT" > "$RAG_DIR/serve.log" 2>&1 &
  sleep 2
  curl -sf -m 5 "http://127.0.0.1:$HTTP_PORT/healthz" > /dev/null && echo "    healthy"
fi
echo "==> done. Qdrant :$QDRANT_PORT, API :$HTTP_PORT"
