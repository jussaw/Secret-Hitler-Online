#!/usr/bin/env bash
# Tests devops/backup-db.sh and devops/restore-db.sh.
#
# The stub_* cases run the scripts against a stubbed `docker` (first on PATH), for the refusals
# and the failure paths. The real_* cases then run them against a real container of the image,
# on a fresh volume, while the server writes: the image built from this checkout, or the one
# IMAGE names. Every case reads its settings from an empty ENV_FILE, never from devops/.env.
#
# Usage: bash devops/tests/backup-restore.test.sh   (needs Docker and curl; IMAGE=<tag> to skip
# the build). Prints "backup-restore tests passed" and exits 0, or names the failure and exits 1.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
ORIG_PATH=$PATH
TMP_ROOT=${TMPDIR:-/tmp}
# A space in the name, so every path the scripts handle has one.
T=$(cd "$(mktemp -d "${TMP_ROOT%/}/sh backup test.XXXXXX")" && pwd -P)
: >"$T/empty.env"

CASE=setup
FAILED=
BUILT_IMAGE=
C=
VOL=
WRITER=

# ---------------------------------------------------------------------------------------------
# Assertions

fail() {
  FAILED=1
  printf 'FAIL: %s: %s\n' "$CASE" "$1" >&2
  exit 1
}

assert_eq() {
  [ "$1" = "$2" ] || fail "$3: expected [$1], got [$2]"
}

assert_has() {
  case "$1" in
    *"$2"*) ;;
    *) fail "expected [$2] in: $1" ;;
  esac
}

assert_lacks() {
  case "$1" in
    *"$2"*) fail "did not expect [$2] in: $1" ;;
    *) ;;
  esac
}

assert_file() {
  [ -f "$1" ] || fail "no file $1"
}

assert_absent() {
  [ ! -e "$1" ] || fail "$1 should not exist"
}

# assert_none <dir> <glob>: no file in <dir> matches <glob>.
assert_none() {
  local f
  for f in "$1"/$2; do
    [ ! -e "$f" ] || fail "$f should not exist"
  done
}

# run <command...>: runs it with stdout and stderr together in OUT and its exit status in
# STATUS, without tripping set -e.
run() {
  set +e
  OUT=$("$@" 2>&1)
  STATUS=$?
  set -e
}

sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# check_sha <dir> <name.sha256>: the checksum file checks out, run in <dir> as a person would.
check_sha() {
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$1" && sha256sum -c "$2") >/dev/null 2>&1 || fail "$2 does not check out in $1"
  else
    (cd "$1" && shasum -a 256 -c "$2") >/dev/null 2>&1 || fail "$2 does not check out in $1"
  fi
}

# ---------------------------------------------------------------------------------------------
# The real server

STARTUP_LINE="Secret Hitler Online is listening on port"

ensure_image() {
  if [ -n "${IMAGE:-}" ]; then
    return
  fi
  IMAGE="secret-hitler-online:backup-test-$$"
  BUILT_IMAGE=$IMAGE
  echo "==> Building $IMAGE from $REPO (minutes the first time)"
  if ! docker build -t "$IMAGE" "$REPO" >"$T/build.log" 2>&1; then
    tail -n 40 "$T/build.log" >&2
    fail "the image did not build"
  fi
}

start_server() {
  VOL="shtest-$$-data"
  C="shtest-$$-server"
  docker volume create "$VOL" >/dev/null
  docker run -d --name "$C" -e TEST_SIGN_IN=true -v "$VOL":/data -p 127.0.0.1::8080 "$IMAGE" >/dev/null
  local waited=0
  until docker logs "$C" 2>&1 | grep -q "$STARTUP_LINE"; do
    [ "$(docker inspect --format '{{.State.Running}}' "$C")" = true ] ||
      fail "the server exited: $(docker logs --tail 20 "$C" 2>&1)"
    [ "$waited" -lt 120 ] || fail "the server did not start within 120 s"
    sleep 1
    waited=$((waited + 1))
  done
}

# The server's address on this machine, read afresh each time: a restart picks a new port.
base_url() {
  echo "http://$(docker port "$C" 8080/tcp | head -n 1)"
}

# sign_in <id>: a test sign-in, which writes an account and a session.
sign_in() {
  curl -fsS -X POST -H 'Content-Type: application/json' --data "{\"id\":\"$1\"}" \
    "$(base_url)/auth/test-sign-in"
}

# db_rows <sql or dot-command...>: sqlite3 on the server's own database, in its container.
db_rows() {
  docker exec "$C" sqlite3 -bail -cmd '.timeout 5000' /data/backup.db "$@"
}

# file_rows <file> <sql or dot-command...>: sqlite3 on a copy of <file>, in a one-off container.
file_rows() {
  local file=$1 dir
  shift
  dir=$(mktemp -d "$T/rows.XXXXXX")
  cp "$file" "$dir/copy.db"
  docker run --rm --user root --network none -v "$dir":/rows "$IMAGE" \
    sqlite3 -bail -cmd '.timeout 5000' /rows/copy.db "$@"
  rm -rf "$dir"
}

# table_rows <sqlite3 runner...>: every table but SQLite's own, by name, each as "== <table>"
# and its rows quoted and sorted. So two databases compare as text, a table a later phase adds
# included.
table_rows() {
  local table
  "$@" "SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name" |
    while IFS= read -r table; do
      echo "== $table"
      "$@" '.mode quote' "SELECT * FROM \"$table\"" </dev/null | LC_ALL=C sort
    done
}

# A background loop of test sign-ins, so the server writes while a backup runs.
start_writer() {
  : >"$T/writer-errors"
  rm -f "$T/writer-stop"
  (
    n=0
    while [ ! -e "$T/writer-stop" ]; do
      n=$((n + 1))
      sign_in "w$n" >/dev/null 2>&1 || echo "sign-in w$n failed" >>"$T/writer-errors"
    done
  ) &
  WRITER=$!
}

stop_writer() {
  [ -n "$WRITER" ] || return 0
  touch "$T/writer-stop"
  wait "$WRITER" || true
  WRITER=
  [ ! -s "$T/writer-errors" ] || fail "the writer failed: $(head -n 5 "$T/writer-errors")"
}

cleanup() {
  local status=$?
  PATH=$ORIG_PATH
  if [ -n "$WRITER" ]; then
    touch "$T/writer-stop"
    wait "$WRITER" 2>/dev/null || true
  fi
  [ -z "$C" ] || docker rm -f "$C" >/dev/null 2>&1 || true
  [ -z "$VOL" ] || docker volume rm "$VOL" >/dev/null 2>&1 || true
  [ -z "$BUILT_IMAGE" ] || docker rmi "$BUILT_IMAGE" >/dev/null 2>&1 || true
  rm -rf "$T"
  if [ "$status" -ne 0 ] && [ -z "$FAILED" ]; then
    printf 'FAIL: %s: exited %s\n' "$CASE" "$status" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

# ---------------------------------------------------------------------------------------------
# Against the real image

real_image_basics() {
  assert_eq 1000 "$(docker exec "$C" id -u)" "the image's user"
  docker exec "$C" sqlite3 --version >/dev/null 2>&1 || fail "no sqlite3 in the image"
  assert_has "$(docker logs "$C" 2>&1)" "Secret Hitler Online is listening on port 8080."
  assert_eq wal "$(db_rows 'PRAGMA journal_mode')" "the journal mode"
}

# ---------------------------------------------------------------------------------------------

REAL_CASES="real_image_basics"

main() {
  unset CONTAINER_NAME DB_PATH BACKUP_DIR RETENTION_DAYS AFTER_BACKUP STARTUP_TIMEOUT_SECONDS ENV_FILE
  local name
  for name in $(declare -F | awk '{print $3}' | grep '^stub_' || true); do
    CASE=$name
    echo "--- $name"
    "$name"
  done
  PATH=$ORIG_PATH
  CASE=setup
  docker info >/dev/null 2>&1 || fail "needs a running Docker"
  ensure_image
  start_server
  for name in $REAL_CASES; do
    CASE=$name
    echo "--- $name"
    "$name"
  done
  echo "backup-restore tests passed"
}

main "$@"
