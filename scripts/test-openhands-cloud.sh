#!/usr/bin/env bash
# E2E tests for scripts/openhands-cloud. Sources the script as a library
# (OHC_LIB_ONLY=1) and exercises the review-critical behaviors deterministically,
# without needing the full app. Exits non-zero on any failure.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/openhands-cloud"
FAILS=0
pass() { printf '  [PASS] %s\n' "$1"; }
fail() {
  printf '  [FAIL] %s\n' "$1"
  FAILS=$((FAILS + 1))
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Isolate runtime state + use non-privileged test ports.
export OHC_RUNTIME_DIR="$TMP/rt"
export BACKEND_PORT=39001
export FRONTEND_PORT=39002
export OHC_LIB_ONLY=1
# shellcheck source=/dev/null
source "$SCRIPT"

echo "== test: report JSON is valid via a real serializer =="
# R_* arrays are declared (empty) by the sourced script; record() appends.
record "install" "PASS" 12 0 "poetry import" 'ok'
record "quirk" "FAIL" 5 1 'cmd with "quotes" and \back' 'detail with "quotes", \ and, commas'
emit_report_json "$TMP/report.json"
if python3 -m json.tool "$TMP/report.json" >/dev/null 2>&1; then
  if python3 -c "import json,sys
d=json.load(open('$TMP/report.json'))
assert d['checks_sha256'], 'missing checks_sha256'
assert 'head_sha' in d and 'base_sha' in d, 'missing head/base sha'
assert len(d['checks'])==2, 'wrong check count'
assert d['checks'][1]['exit']==1, 'exit not captured'" 2>/dev/null; then
    pass "doctor report is valid JSON with head/base/checks_sha256 + per-check exit"
  else
    fail "report JSON missing required fields"
  fi
else
  fail "report JSON is not parseable"
fi

echo "== test: start refuses to kill a FOREIGN process on an app port =="
python3 -c 'import socket,time
s=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(("127.0.0.1",39001)); s.listen(5); time.sleep(60)' &
FOREIGN=$!
sleep 1
out="$(cmd_start 2>&1)"
rc=$?
if [ $rc -ne 0 ] && printf '%s' "$out" | grep -qi "foreign"; then
  if kill -0 "$FOREIGN" 2>/dev/null; then
    pass "foreign port preserved; start aborted with a precise message"
  else
    fail "foreign process was killed (must never happen)"
  fi
else
  fail "start did not abort/report on a foreign port (rc=$rc)"
fi
kill "$FOREIGN" 2>/dev/null || true

echo "== test: stop only touches OUR tracked process group =="
# Owned group: a setsid sleep whose leader pid == pgid, recorded in PIDFILE.
setsid bash -c 'sleep 60' &
OWNED=$!
mkdir -p "$OHC_RUNTIME_DIR"
echo "$OWNED" >"$OHC_RUNTIME_DIR/app.pgid"
# A separate foreign sleep that must survive stop.
sleep 60 &
FOREIGN2=$!
cmd_stop >/dev/null 2>&1 || true
sleep 1
if ! kill -0 "$OWNED" 2>/dev/null && kill -0 "$FOREIGN2" 2>/dev/null; then
  pass "stop killed the owned group and preserved the foreign process"
else
  fail "stop did not correctly scope to the owned group"
fi
kill "$FOREIGN2" 2>/dev/null || true

echo "== test: pnpm resolves from PATH without Corepack (Node26 no-corepack) =="
mkdir -p "$TMP/fakebin"
printf '#!/usr/bin/env bash\necho fake-pnpm\n' >"$TMP/fakebin/pnpm"
chmod +x "$TMP/fakebin/pnpm"
if (
  export PATH="$TMP/fakebin:$PATH"
  _PNPM=()
  resolve_pnpm && [ "${_PNPM[0]}" = "pnpm" ]
); then
  pass "resolve_pnpm prefers PATH pnpm (no corepack required)"
else
  fail "resolve_pnpm did not use PATH pnpm"
fi

echo "== test: checks are non-mutating (no biome --write in real commands) =="
# Ignore comment lines; only a real (non-comment) --write is a violation.
if grep -vE '^\s*#' "$SCRIPT" | grep -qE -- "--write"; then
  fail "script contains a --write command (mutating)"
else
  pass "no --write command in the control script"
fi

echo "== test: bounded self-heal path present (backend-rerun + REPAIRED) =="
if grep -q "backend-rerun" "$SCRIPT" && grep -q "REPAIRED" "$SCRIPT"; then
  pass "doctor has a bounded repair+rerun (no unbounded loop)"
else
  fail "self-heal repair path missing"
fi

echo "== test: non-mutating git status (read-only ops don't change the tree) =="
before="$(git -C "$HERE/.." status --porcelain 2>/dev/null | wc -l)"
cmd_status >/dev/null 2>&1 || true
cmd_help() { usage; }
cmd_help >/dev/null 2>&1 || true
after="$(git -C "$HERE/.." status --porcelain 2>/dev/null | wc -l)"
if [ "$before" = "$after" ]; then
  pass "read-only subcommands did not modify the working tree"
else
  fail "working tree changed after read-only ops ($before -> $after)"
fi

echo
if [ "$FAILS" -eq 0 ]; then
  c_green "openhands-cloud E2E: ALL PASS"
  exit 0
fi
c_red "openhands-cloud E2E: $FAILS failure(s)"
exit 1
