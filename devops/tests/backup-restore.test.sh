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
# The stubbed docker

# stub_docker: a fresh stub `docker` first on PATH, which logs every call as one line to
# DOCKER_LOG and answers the forms the scripts use; its knobs at their defaults; and a fresh,
# empty backup directory B. Anything else it is asked prints "unexpected docker call" and
# exits 99.
stub_docker() {
  rm -rf "$T/stub" "$T/backups"
  mkdir "$T/stub" "$T/backups"
  B="$T/backups"
  export DOCKER_LOG="$T/docker.log"
  : >"$DOCKER_LOG"
  export STUB_SNAPSHOT="$T/stub-snapshot.db"
  printf 'SQLite format 3\000a stubbed snapshot\n' >"$STUB_SNAPSHOT"
  export STUB_RUNNING=true STUB_INTEGRITY=ok STUB_CP_FROM="$STUB_SNAPSHOT"
  export STUB_RUN_EXIT=0 STUB_STATUS=running
  export STUB_LOGS="12:00:00.000 [main] INFO  server.SecretHitlerServer -- $STARTUP_LINE 8080."
  cat >"$T/stub/docker" <<'STUB'
#!/usr/bin/env bash
# One line per call, even for an argument with line breaks in it (the restore's swap script).
{ printf '%s' "$*" | tr '\n' ' '; echo; } >>"$DOCKER_LOG"
unexpected() {
  echo "unexpected docker call: $*" >&2
  exit 99
}
hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}
case "$1" in
  inspect)
    [ "$#" -eq 4 ] && [ "$2" = --format ] || unexpected "$@"
    if [ "$STUB_RUNNING" = missing ]; then
      echo "Error: No such object: $4" >&2
      exit 1
    fi
    case "$3" in
      '{{.State.Running}}') echo "$STUB_RUNNING" ;;
      '{{.Image}}') echo sha256:stubimage ;;
      '{{.State.StartedAt}}') echo 2026-01-01T00:00:00.000000000Z ;;
      '{{.State.Status}}') echo "$STUB_STATUS" ;;
      *) unexpected "$@" ;;
    esac
    ;;
  exec)
    if [ "$#" -eq 8 ] && [ "$3 $4 $5 $6" = "sqlite3 -bail -cmd .timeout 5000" ]; then
      case "$8" in
        "VACUUM INTO '"*"'") exit 0 ;;
      esac
    fi
    if [ "$#" -eq 6 ] && [ "$3 $4 $6" = "sqlite3 -bail PRAGMA integrity_check" ]; then
      echo "$STUB_INTEGRITY"
      exit 0
    fi
    if [ "$#" -eq 4 ] && [ "$3" = sha256sum ]; then
      echo "$(hash_of "$STUB_SNAPSHOT")  $4"
      exit 0
    fi
    if [ "$#" -ge 4 ] && [ "$3 $4" = "rm -f" ]; then
      exit 0
    fi
    unexpected "$@"
    ;;
  cp)
    [ "$#" -eq 3 ] || unexpected "$@"
    cp "$STUB_CP_FROM" "$3"
    ;;
  stop | start)
    [ "$#" -eq 2 ] || unexpected "$@"
    echo "$2"
    ;;
  run) exit "$STUB_RUN_EXIT" ;;
  logs) printf '%s\n' "$STUB_LOGS" ;;
  *) unexpected "$@" ;;
esac
STUB
  chmod +x "$T/stub/docker"
  PATH="$T/stub:$ORIG_PATH"
}

docker_calls() {
  cat "$DOCKER_LOG"
}

# Each call's first word, space-separated: "inspect exec exec …".
docker_subcommands() {
  awk '{print $1}' "$DOCKER_LOG" | xargs
}

# backup_with [NAME=value...]: the backup script through run, against the stub's "shtest".
backup_with() {
  run env ENV_FILE="$T/empty.env" CONTAINER_NAME=shtest BACKUP_DIR="$B" "$@" "$REPO/devops/backup-db.sh"
}

# A local time <n> days ago, for touch -t (GNU date, then BSD date).
days_ago() {
  date -d "$1 days ago" +%Y%m%d%H%M 2>/dev/null || date -v-"$1"d +%Y%m%d%H%M
}

# The one backup the last run made in B, named like secret-hitler-<UTC timestamp>.db, other than
# the names given.
new_backup() {
  local name found=
  for name in $(ls -A "$B" | grep -E '^secret-hitler-[0-9]{8}T[0-9]{6}Z\.db$' || true); do
    case " $* " in
      *" $name "*) continue ;;
    esac
    [ -z "$found" ] || fail "more than one new backup: $found, $name"
    found=$name
  done
  [ -n "$found" ] || fail "no new backup in $B: $(ls -A "$B" | xargs)"
  echo "$B/$found"
}

expect_refused_before_docker() {
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "$1"
  assert_eq "" "$(docker_calls)" "the docker calls"
}

# ---------------------------------------------------------------------------------------------
# The backup, against the stub

stub_backup_takes_a_checked_snapshot() {
  stub_docker
  mkdir "$B/old"
  local old=secret-hitler-20000101T000000Z f
  for f in "$old.db" "$old.db.sha256" notes.txt "$old.dump" "old/$old.db"; do
    touch -t 200001010000 "$B/$f"
  done
  touch "$B/secret-hitler-20991231T000000Z.db" # recent: kept
  backup_with
  assert_eq 0 "$STATUS" "exit"
  NEW=$(new_backup secret-hitler-20991231T000000Z.db)
  cmp -s "$STUB_SNAPSHOT" "$NEW" || fail "the backup is not the snapshot"
  assert_eq "$(sha_of "$NEW")  $(basename "$NEW")" "$(cat "$NEW.sha256")" "the .sha256"
  check_sha "$B" "$(basename "$NEW").sha256"
  assert_has "$OUT" "Backup complete: $NEW"
  assert_eq "Backup complete: $NEW" "$(printf '%s\n' "$OUT" | tail -n 1)" "the last line"
  assert_absent "$B/$old.db"
  assert_absent "$B/$old.db.sha256"
  assert_file "$B/notes.txt"
  assert_file "$B/$old.dump"
  assert_file "$B/old/$old.db"
  assert_file "$B/secret-hitler-20991231T000000Z.db"
  assert_none "$B" '.secret-hitler-*'
  assert_has "$(docker_calls)" \
    "exec shtest sqlite3 -bail -cmd .timeout 5000 /data/backup.db VACUUM INTO '/data/.secret-hitler-backup-"
  local snap
  snap=$(docker_calls | sed -n "s|.*VACUUM INTO '\(.*\)'$|\1|p")
  assert_has "$(docker_calls)" "exec shtest sqlite3 -bail $snap PRAGMA integrity_check"
  assert_has "$(docker_calls)" "exec shtest sha256sum $snap"
  assert_has "$(docker_calls)" "cp shtest:$snap $B/.secret-hitler-"
  assert_has "$(docker_calls)" "exec shtest rm -f $snap $snap-wal $snap-shm"
  assert_eq "inspect exec exec exec cp exec" "$(docker_subcommands)" "the order"
}

stub_backup_needs_a_running_container() {
  local state
  for state in false missing; do
    stub_docker
    STUB_RUNNING=$state
    backup_with
    assert_eq 1 "$STATUS" "exit when running is $state"
    assert_has "$OUT" "is not running"
    assert_lacks "$(docker_calls)" "exec"
    assert_eq "" "$(ls -A "$B")" "the backup directory"
  done
}

stub_backup_refuses_a_bad_snapshot() {
  stub_docker
  STUB_INTEGRITY='*** in database main ***'
  backup_with
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "Integrity check failed"
  assert_lacks " $(docker_subcommands) " " cp "
  assert_has "$(docker_calls)" "exec shtest rm -f /data/.secret-hitler-backup-"
  assert_eq "" "$(ls -A "$B")" "the backup directory"
}

stub_backup_refuses_a_torn_copy() {
  stub_docker
  cp "$STUB_SNAPSHOT" "$T/longer.db"
  printf 'x' >>"$T/longer.db"
  STUB_CP_FROM="$T/longer.db"
  backup_with
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "does not match"
  assert_has "$(docker_calls)" "exec shtest rm -f /data/.secret-hitler-backup-"
  assert_eq "" "$(ls -A "$B")" "the backup directory"
}

stub_bad_settings_stop_first() {
  stub_docker
  run env ENV_FILE="$T/empty.env" CONTAINER_NAME=shtest "$REPO/devops/backup-db.sh"
  expect_refused_before_docker BACKUP_DIR
  local value
  for value in backups "$T/none" ""; do
    backup_with BACKUP_DIR="$value"
    expect_refused_before_docker BACKUP_DIR
  done
  touch "$T/a file"
  backup_with BACKUP_DIR="$T/a file"
  expect_refused_before_docker BACKUP_DIR
  for value in 0 -1 30d 00 " 30" 1.5; do
    backup_with RETENTION_DAYS="$value"
    expect_refused_before_docker RETENTION_DAYS
  done
  assert_eq "" "$(ls -A "$B")" "the backup directory"
  # An empty value is the default, 30 days.
  touch -t "$(days_ago 31)" "$B/secret-hitler-20000101T000000Z.db"
  touch -t "$(days_ago 29)" "$B/secret-hitler-20000102T000000Z.db"
  backup_with RETENTION_DAYS=""
  assert_eq 0 "$STATUS" "exit with an empty RETENTION_DAYS"
  assert_absent "$B/secret-hitler-20000101T000000Z.db"
  assert_file "$B/secret-hitler-20000102T000000Z.db"
  # A number with a leading zero is still in days, not octal.
  stub_docker
  touch -t "$(days_ago 9)" "$B/secret-hitler-20000101T000000Z.db"
  backup_with RETENTION_DAYS=010
  assert_eq 0 "$STATUS" "exit with RETENTION_DAYS=010"
  assert_file "$B/secret-hitler-20000101T000000Z.db"
}

stub_a_taken_name_stops_the_backup() {
  stub_docker
  printf '#!/bin/sh\necho 20260101T000000Z\n' >"$T/stub/date"
  chmod +x "$T/stub/date"
  printf 'an earlier backup\n' >"$B/secret-hitler-20260101T000000Z.db"
  backup_with
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "already exists"
  assert_eq "an earlier backup" "$(cat "$B/secret-hitler-20260101T000000Z.db")" "the earlier backup"
  assert_lacks "$(docker_calls)" "exec"
  assert_eq "secret-hitler-20260101T000000Z.db" "$(ls -A "$B" | xargs)" "the backup directory"
}

stub_a_failing_hook_keeps_the_backup() {
  stub_docker
  backup_with AFTER_BACKUP='exit 3'
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "AFTER_BACKUP failed"
  NEW=$(new_backup)
  assert_file "$NEW.sha256"
  check_sha "$B" "$(basename "$NEW").sha256"
  assert_none "$B" '.secret-hitler-*'
}

# ---------------------------------------------------------------------------------------------
# The restore, against the stub

# with_sha <file>: writes <file>.sha256 for it, as the backup does.
with_sha() {
  printf '%s  %s\n' "$(sha_of "$1")" "$(basename "$1")" >"$1.sha256"
}

# good_backup <file>: a file with SQLite's header, and its .sha256.
good_backup() {
  mkdir -p "$(dirname "$1")"
  printf 'SQLite format 3\000a backup\n' >"$1"
  with_sha "$1"
}

# restore_typing <typed> <file> [NAME=value...]: the restore through run, from the current
# directory, with <typed> as the answer to its question. Run it after a plain cd, never in a
# subshell, so STATUS and OUT reach the caller.
restore_typing() {
  local typed=$1 file=$2
  shift 2
  run env ENV_FILE="$T/empty.env" "$@" "$REPO/devops/restore-db.sh" "$file" <<EOF
$typed
EOF
}

stub_restore_refuses_a_bad_file() {
  stub_docker
  mkdir "$T/bad"
  printf 'just some text, long enough for a header\n' >"$T/bad/text.db"
  with_sha "$T/bad/text.db"
  printf '0123456789' >"$T/bad/short.db"
  with_sha "$T/bad/short.db"
  printf 'SQLite format 3!and the rest\n' >"$T/bad/bang.db"
  with_sha "$T/bad/bang.db"
  local f
  for f in text short bang; do
    restore_typing shtest "$T/bad/$f.db" CONTAINER_NAME=shtest
    expect_refused_before_docker "is not a SQLite database"
  done
  good_backup "$T/bad/bare.db"
  rm "$T/bad/bare.db.sha256"
  restore_typing shtest "$T/bad/bare.db" CONTAINER_NAME=shtest
  expect_refused_before_docker "no checksum file"
  good_backup "$T/bad/other.db"
  printf '%s  other.db\n' "$(sha_of "$T/bad/text.db")" >"$T/bad/other.db.sha256"
  restore_typing shtest "$T/bad/other.db" CONTAINER_NAME=shtest
  expect_refused_before_docker "does not match its checksum"
  printf 'not a checksum\n' >"$T/bad/other.db.sha256"
  restore_typing shtest "$T/bad/other.db" CONTAINER_NAME=shtest
  expect_refused_before_docker "does not match its checksum"
  restore_typing shtest "$T/bad/none.db" CONTAINER_NAME=shtest
  expect_refused_before_docker "is not a file"
  restore_typing shtest "$T/bad" CONTAINER_NAME=shtest
  expect_refused_before_docker "is not a file"
  run env ENV_FILE="$T/empty.env" "$REPO/devops/restore-db.sh" </dev/null
  expect_refused_before_docker "Usage"
}

stub_restore_needs_the_name() {
  stub_docker
  local f="$T/name/secret-hitler-20260101T000000Z.db"
  good_backup "$f"
  restore_typing nope "$f" CONTAINER_NAME=shtest
  expect_refused_before_docker "Restore cancelled"
  restore_typing " shtest" "$f" CONTAINER_NAME=shtest
  expect_refused_before_docker "Restore cancelled"
  run env ENV_FILE="$T/empty.env" CONTAINER_NAME=shtest "$REPO/devops/restore-db.sh" "$f" </dev/null
  expect_refused_before_docker "Restore cancelled"
  assert_has "$OUT" "$f"
  assert_has "$OUT" "shtest"
  assert_has "$OUT" "Type the container's name to go on: "
}

stub_restore_needs_the_container() {
  stub_docker
  STUB_RUNNING=missing
  local f="$T/container/secret-hitler-20260101T000000Z.db"
  good_backup "$f"
  restore_typing shtest "$f" CONTAINER_NAME=shtest
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "No container"
  assert_eq inspect "$(docker_subcommands)" "the docker calls"
}

stub_restore_swaps_and_waits() {
  stub_docker
  local f="$T/sub dir/secret-hitler-20260101T000000Z.db"
  good_backup "$f"
  cd "$T"
  restore_typing shtest "./sub dir/$(basename "$f")" CONTAINER_NAME=shtest
  cd "$REPO"
  assert_eq 0 "$STATUS" "exit: $OUT"
  assert_has "$OUT" "Restore complete"
  assert_eq "inspect stop run start inspect logs" "$(docker_subcommands)" "the order"
  assert_has "$(docker_calls)" "inspect --format {{.Image}} shtest"
  assert_has "$(docker_calls)" "run --rm --network none --user root --volumes-from shtest -v \
$(cd "$T/sub dir" && pwd -P)/$(basename "$f"):/restore/backup.db:ro sha256:stubimage sh -euc"
  local swap
  swap=$(grep '^run ' "$DOCKER_LOG")
  assert_has "$swap" "/data/backup.db $(sha_of "$f")"
  # Every check comes before the old files go and the copy moves into place.
  local step at last=0
  for step in "cp /restore/backup.db" "sha256sum" "chown 1000:1000" '"$1-wal"' '"$1-shm"' '"$1-journal"' "mv "; do
    at=$(awk -v s="$step" '{ print index($0, s) }' <<<"$swap")
    [ "$at" -gt "$last" ] || fail "the swap's [$step] is missing or out of order: $swap"
    last=$at
  done
  assert_has "$(docker_calls)" "logs --since 2026-01-01T00:00:00.000000000Z shtest"
}

stub_failed_swap_starts_the_old_database() {
  stub_docker
  STUB_RUN_EXIT=1
  local f="$T/failed/secret-hitler-20260101T000000Z.db"
  good_backup "$f"
  restore_typing shtest "$f" CONTAINER_NAME=shtest
  assert_eq 1 "$STATUS" "exit"
  assert_has "$OUT" "was not replaced"
  assert_eq "inspect stop run start" "$(docker_subcommands)" "the docker calls"
}

stub_restore_reports_a_server_that_does_not_start() {
  stub_docker
  local f="$T/start/secret-hitler-20260101T000000Z.db" began
  good_backup "$f"
  STUB_STATUS=exited
  STUB_LOGS=boom
  began=$SECONDS
  restore_typing shtest "$f" CONTAINER_NAME=shtest
  assert_eq 1 "$STATUS" "exit when the container exits"
  assert_has "$OUT" "did not start"
  assert_has "$OUT" "boom"
  [ $((SECONDS - began)) -lt 3 ] || fail "an exited container took $((SECONDS - began)) s to report"
  stub_docker
  STUB_LOGS="12:00:00.000 [main] INFO  server.SecretHitlerServer -- Loaded backup."
  began=$SECONDS
  restore_typing shtest "$f" CONTAINER_NAME=shtest STARTUP_TIMEOUT_SECONDS=1
  assert_eq 1 "$STATUS" "exit when the line never comes"
  assert_has "$OUT" "did not start"
  [ $((SECONDS - began)) -lt 5 ] || fail "a 1 s timeout took $((SECONDS - began)) s"
}

stub_bad_restore_settings_stop_first() {
  stub_docker
  local f="$T/settings/secret-hitler-20260101T000000Z.db" value
  good_backup "$f"
  for value in abc 0 -1 5s; do
    restore_typing shtest "$f" CONTAINER_NAME=shtest STARTUP_TIMEOUT_SECONDS="$value"
    expect_refused_before_docker STARTUP_TIMEOUT_SECONDS
  done
  restore_typing shtest "$f" CONTAINER_NAME=shtest DB_PATH=backup.db
  expect_refused_before_docker DB_PATH
}

# ---------------------------------------------------------------------------------------------
# Both scripts

stub_settings_precedence() {
  stub_docker
  cat >"$T/settings.env" <<EOF
# A comment, a blank line, an earlier line for the same name and quotes.
CONTAINER_NAME=an-earlier-line

CONTAINER_NAME="from-file"
BACKUP_DIR='$B'
EOF
  run env ENV_FILE="$T/settings.env" "$REPO/devops/backup-db.sh"
  assert_eq 0 "$STATUS" "exit with the settings file"
  assert_has "$(docker_calls)" "inspect --format {{.State.Running}} from-file"
  assert_lacks "$(docker_calls)" "an-earlier-line"

  stub_docker
  run env ENV_FILE="$T/settings.env" CONTAINER_NAME=from-env "$REPO/devops/backup-db.sh"
  assert_eq 0 "$STATUS" "exit with the environment"
  assert_has "$(docker_calls)" "inspect --format {{.State.Running}} from-env"
  assert_lacks "$(docker_calls)" "from-file"

  stub_docker
  run env ENV_FILE="$T/missing.env" CONTAINER_NAME=shtest BACKUP_DIR="$B" "$REPO/devops/backup-db.sh"
  expect_refused_before_docker ENV_FILE

  # Copied alone, with no ENV_FILE: no .env beside it is fine, and one beside it is read.
  stub_docker
  mkdir -p "$T/alone"
  cp "$REPO/devops/backup-db.sh" "$T/alone/"
  run env BACKUP_DIR="$B" "$T/alone/backup-db.sh"
  assert_eq 0 "$STATUS" "exit copied alone"
  assert_has "$(docker_calls)" "inspect --format {{.State.Running}} secret-hitler-online"
  stub_docker
  printf 'CONTAINER_NAME=from-default\nBACKUP_DIR=%s\n' "$B" >"$T/alone/.env"
  run env "$T/alone/backup-db.sh"
  assert_eq 0 "$STATUS" "exit with a .env beside it"
  assert_has "$(docker_calls)" "inspect --format {{.State.Running}} from-default"

  # The restore reads the same way.
  local f="$T/precedence/secret-hitler-20260101T000000Z.db"
  good_backup "$f"
  stub_docker
  restore_typing from-file "$f" ENV_FILE="$T/settings.env"
  assert_eq 0 "$STATUS" "the restore's exit with the settings file: $OUT"
  assert_has "$(docker_calls)" "stop from-file"
  assert_lacks "$(docker_calls)" "an-earlier-line"
  stub_docker
  restore_typing from-env "$f" ENV_FILE="$T/settings.env" CONTAINER_NAME=from-env
  assert_eq 0 "$STATUS" "the restore's exit with the environment: $OUT"
  assert_has "$(docker_calls)" "stop from-env"
  assert_lacks "$(docker_calls)" "from-file"
  stub_docker
  restore_typing shtest "$f" ENV_FILE="$T/missing.env" CONTAINER_NAME=shtest
  expect_refused_before_docker ENV_FILE
  stub_docker
  cp "$REPO/devops/restore-db.sh" "$T/alone/"
  run "$T/alone/restore-db.sh" "$f" <<EOF
from-default
EOF
  assert_eq 0 "$STATUS" "the restore's exit with a .env beside it: $OUT"
  assert_has "$(docker_calls)" "stop from-default"
}

stub_env_file_is_ignored() {
  git -C "$REPO" check-ignore -q devops/.env || fail "devops/.env is not git-ignored"
  if git -C "$REPO" check-ignore -q devops/.env.example; then
    fail "devops/.env.example is git-ignored"
  fi
}

# ---------------------------------------------------------------------------------------------
# Against the real image

real_image_basics() {
  assert_eq 1000 "$(docker exec "$C" id -u)" "the image's user"
  docker exec "$C" sqlite3 --version >/dev/null 2>&1 || fail "no sqlite3 in the image"
  assert_has "$(docker logs "$C" 2>&1)" "Secret Hitler Online is listening on port 8080."
  assert_eq wal "$(db_rows 'PRAGMA journal_mode')" "the journal mode"
}

real_backup_while_writing() {
  rm -rf "$T/backups"
  mkdir "$T/backups"
  start_writer
  local waited=0
  until [ "$(db_rows 'SELECT count(*) FROM accounts')" -ge 20 ]; do
    [ "$waited" -lt 60 ] || fail "the writer made fewer than 20 accounts in 60 s"
    sleep 1
    waited=$((waited + 1))
  done
  local before
  before=$(db_rows 'SELECT count(*) FROM accounts')
  run env ENV_FILE="$T/empty.env" CONTAINER_NAME="$C" BACKUP_DIR="$T/backups" \
    HOOK_OUT="$T/hook-out" AFTER_BACKUP='printf "%s\n" "$1" > "$HOOK_OUT"' \
    "$REPO/devops/backup-db.sh"
  [ "$(db_rows 'SELECT count(*) FROM accounts')" -gt "$before" ] || fail "the writes stopped"
  assert_eq 0 "$STATUS" "exit: $OUT"
  B="$T/backups"
  BACKUP=$(new_backup)
  assert_eq "$BACKUP" "$(cat "$T/hook-out")" "the hook's \$1"
  check_sha "$T/backups" "$(basename "$BACKUP").sha256"
  assert_eq ok "$(file_rows "$BACKUP" 'PRAGMA integrity_check')" "the backup's integrity"
  assert_eq 0 "$(file_rows "$BACKUP" 'SELECT count(*) FROM sessions
    WHERE account_id NOT IN (SELECT id FROM accounts)')" "sessions without an account"
  assert_eq "backup.db backup.db-shm backup.db-wal" \
    "$(docker exec "$C" ls -A /data | sort | xargs)" "the files in /data"
  assert_none "$T/backups" '.secret-hitler-*'
  BACKUP_ROWS=$(table_rows file_rows "$BACKUP") # the writer keeps going, for the restore
  assert_has "$BACKUP_ROWS" "== accounts"
  assert_has "$BACKUP_ROWS" "== sessions"
}

real_refusals_keep_it_running() {
  local started f
  started=$(docker inspect --format '{{.State.StartedAt}}' "$C")
  mkdir "$T/refused"
  printf 'not a database\n' >"$T/refused/junk.db"
  with_sha "$T/refused/junk.db"
  cp "$BACKUP" "$T/refused/torn.db"
  printf 'X' | dd of="$T/refused/torn.db" bs=1 seek=100 conv=notrunc 2>/dev/null
  cmp -s "$BACKUP" "$T/refused/torn.db" && fail "the torn copy is not torn"
  cp "$BACKUP.sha256" "$T/refused/torn.db.sha256"
  cp "$BACKUP" "$T/refused/bare.db"
  for f in "junk:is not a SQLite database" "torn:does not match its checksum" "bare:no checksum file"; do
    restore_typing "$C" "$T/refused/${f%%:*}.db" CONTAINER_NAME="$C"
    assert_eq 1 "$STATUS" "${f%%:*}"
    assert_has "$OUT" "${f#*:}"
  done
  restore_typing nope "$BACKUP" CONTAINER_NAME="$C"
  assert_eq 1 "$STATUS" "a wrong name"
  assert_has "$OUT" "Restore cancelled"
  assert_eq true "$(docker inspect --format '{{.State.Running}}' "$C")" "still running"
  assert_eq "$started" "$(docker inspect --format '{{.State.StartedAt}}' "$C")" "never restarted"
}

real_restore_brings_back_the_rows() {
  stop_writer
  [ "$(table_rows db_rows)" != "$BACKUP_ROWS" ] || fail "nothing was written after the backup"
  cd "$T/backups"
  restore_typing "$C" "./$(basename "$BACKUP")" CONTAINER_NAME="$C"
  cd "$REPO"
  assert_eq 0 "$STATUS" "exit: $OUT"
  assert_has "$OUT" "Restore complete"
  assert_eq OK "$(curl -fsS "$(base_url)/ping")" "the server, the moment the restore returns"
  # No lobby is ever made, so the backup table has no row whose load the start would count.
  assert_eq "$BACKUP_ROWS" "$(table_rows db_rows)" "every table's rows"
  assert_eq wal "$(db_rows 'PRAGMA journal_mode')" "WAL again"
  assert_eq 1000 "$(docker exec "$C" stat -c %u /data/backup.db)" "the owner"
  assert_lacks "$(docker exec "$C" ls -A /data)" ".secret-hitler-restore-"
  sign_in after-restore >/dev/null || fail "the restored file takes no writes"
}

# ---------------------------------------------------------------------------------------------

# The cases, in the order this file defines them: every stub_* but the stub itself, then every
# real_*, which build on each other.
cases() {
  grep -E "^$1_[a-z0-9_]+\(\) \{\$" "${BASH_SOURCE[0]}" | sed 's/().*//' | grep -v '^stub_docker$' || true
}

main() {
  unset CONTAINER_NAME DB_PATH BACKUP_DIR RETENTION_DAYS AFTER_BACKUP STARTUP_TIMEOUT_SECONDS ENV_FILE
  local name
  for name in $(cases stub); do
    CASE=$name
    echo "--- $name"
    "$name"
  done
  PATH=$ORIG_PATH
  CASE=setup
  docker info >/dev/null 2>&1 || fail "needs a running Docker"
  ensure_image
  start_server
  for name in $(cases real); do
    CASE=$name
    echo "--- $name"
    "$name"
  done
  echo "backup-restore tests passed"
}

main "$@"
