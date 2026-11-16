#!/usr/bin/env bash
# Puts a backup made by devops/backup-db.sh back in place of the Secret Hitler Online database,
# best between games. The file must start with SQLite's header and match the SHA-256 in its
# .sha256, which is checked before anything is stopped. Then, once you type the container's
# name, it stops the container, swaps the file in from a one-off container of the same image
# (the database's -wal, -shm and -journal go, and the copy moves into place in one step), starts
# the container again and waits for the server to say it is listening.
#
# Usage: devops/restore-db.sh <backup file>
#
# Settings come from the environment, then from devops/.env beside this script (or the file
# ENV_FILE names), then the defaults; devops/.env.example lists them. Needs only docker and
# sha256sum (or shasum). Exits 1 with "Error: ..." on stderr on any failure.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
SETTINGS="CONTAINER_NAME DB_PATH STARTUP_TIMEOUT_SECONDS"
# The line the server logs once it listens (SecretHitlerServer.startupLine).
STARTUP_LINE="Secret Hitler Online is listening on port"

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

say() {
  printf '==> %s\n' "$1"
}

# env_file_value <name> <file>: the value of the file's last "<name>=value" line, with one pair
# of surrounding quotes removed. Fails if there is no such line. The file is read, never run.
env_file_value() {
  local name=$1 file=$2 line value found=
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      "$name="*)
        value=${line#"$name="}
        found=1
        ;;
    esac
  done <"$file"
  [ -n "$found" ] || return 1
  case "$value" in
    \"*\" | \'*\')
      if [ "${#value}" -ge 2 ]; then
        value=${value:1:${#value}-2}
      fi
      ;;
  esac
  printf '%s' "$value"
}

# Fills each setting not already in the environment from the settings file.
read_settings() {
  local file name value
  if [ -n "${ENV_FILE:-}" ]; then
    file=$ENV_FILE
    [ -f "$file" ] && [ -r "$file" ] || die "ENV_FILE names $file, which is not a readable file."
  else
    file="$SCRIPT_DIR/.env"
    [ -f "$file" ] || return 0
    [ -r "$file" ] || die "Cannot read $file."
  fi
  for name in $SETTINGS; do
    if [ -z "${!name+x}" ] && value=$(env_file_value "$name" "$file"); then
      printf -v "$name" '%s' "$value"
    fi
  done
}

# whole_number <name>: the setting is a whole number, at least 1, made plain decimal.
whole_number() {
  local name=$1 value=${!1}
  case "$value" in
    '' | *[!0-9]*) die "$name must be a whole number, at least 1 (it is '$value')." ;;
  esac
  [ "${#value}" -le 9 ] || die "$name must be a whole number, at least 1 (it is '$value')."
  value=$((10#$value))
  [ "$value" -ge 1 ] || die "$name must be a whole number, at least 1 (it is '${!1}')."
  printf -v "$name" '%s' "$value"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "Needs sha256sum or shasum."
  fi
}

is_sha256() {
  case "$1" in
    *[!0-9a-f]*) return 1 ;;
  esac
  [ "${#1}" -eq 64 ]
}

# Run in the one-off container as `sh -euc "$SWAP" sh <database> <sha256>`. Every check comes
# before the database's -wal, -shm and -journal go and the copy moves into place, so a failure
# leaves the database as it was. The mv is a rename within the database's directory: one step.
SWAP='copy="$(dirname "$1")/.secret-hitler-restore-$$.db"
trap '\''rm -f "$copy"'\'' EXIT
cp /restore/backup.db "$copy"
got=$(sha256sum "$copy" | cut -d " " -f 1)
if [ "$got" != "$2" ]; then
  echo "The copy in the container does not match the checksum." >&2
  exit 1
fi
chown 1000:1000 "$copy"
rm -f "$1-wal" "$1-shm" "$1-journal"
mv "$copy" "$1"'

# What the trap knows: whether this run stopped the container, and how far the swap got.
STAGE=

cleanup() {
  local status=$?
  case "$STAGE" in
    stopped | swapping | swapped)
      # Stopped early (a signal, say): the game is never left down.
      if docker start "$CONTAINER_NAME" >/dev/null 2>&1; then
        printf 'Started %s again.\n' "$CONTAINER_NAME" >&2
      else
        printf 'Could not start %s again: run docker start %s.\n' "$CONTAINER_NAME" "$CONTAINER_NAME" >&2
      fi
      case "$STAGE" in
        stopped) printf 'Its database was not replaced.\n' >&2 ;;
        swapping) printf 'The swap may or may not have finished: check its database.\n' >&2 ;;
        swapped) printf 'Its database was replaced by %s.\n' "$file" >&2 ;;
      esac
      ;;
  esac
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

[ "$#" -eq 1 ] || die "Usage: $0 <backup file>"

read_settings
CONTAINER_NAME=${CONTAINER_NAME:-secret-hitler-online}
DB_PATH=${DB_PATH:-/data/backup.db}
STARTUP_TIMEOUT_SECONDS=${STARTUP_TIMEOUT_SECONDS:-120}
whole_number STARTUP_TIMEOUT_SECONDS
case "$DB_PATH" in
  /*$'\n'*) die "DB_PATH must not hold a line break." ;;
  /*) ;;
  *) die "DB_PATH must be an absolute path in the container (it is '$DB_PATH')." ;;
esac

# 1. The file: SQLite's header, and the SHA-256 its .sha256 gives. Nothing is stopped yet.
file=$1
[ -f "$file" ] || die "$file is not a file."
file="$(cd "$(dirname "$file")" && pwd -P)/$(basename "$file")"
case "$file" in
  *:*) die "$file has a colon in its path, which docker cannot mount: move or rename it." ;;
esac
head -c 16 "$file" | cmp -s - <(printf 'SQLite format 3\000') || die "$file is not a SQLite database."
[ -f "$file.sha256" ] || die "$file has no checksum file ($file.sha256)."
expected=$(awk 'NR == 1 { print tolower($1) }' "$file.sha256")
is_sha256 "$expected" || die "$file does not match its checksum: $file.sha256 holds no SHA-256."
actual=$(sha256_of "$file")
[ "$actual" = "$expected" ] || die "$file does not match its checksum ($file.sha256)."

# 2. The container's name, typed.
say "This stops $CONTAINER_NAME, replaces its database $DB_PATH with $file and starts it again."
printf "Type the container's name to go on: "
typed=
IFS= read -r typed || true
[ "$typed" = "$CONTAINER_NAME" ] || die "Restore cancelled: nothing was stopped or changed."

# 3. Its image, then stop it.
image=$(docker inspect --format '{{.Image}}' "$CONTAINER_NAME" 2>/dev/null) || image=
[ -n "$image" ] || die "No container named $CONTAINER_NAME."
say "Stopping $CONTAINER_NAME"
docker stop "$CONTAINER_NAME" >/dev/null || die "Could not stop $CONTAINER_NAME; nothing was replaced."
STAGE=stopped

# 4. The swap, in a one-off container of the same image with the container's volumes.
say "Putting $file in place of $DB_PATH"
STAGE=swapping
if ! docker run --rm --network none --user root --volumes-from "$CONTAINER_NAME" \
  -v "$file:/restore/backup.db:ro" "$image" sh -euc "$SWAP" sh "$DB_PATH" "$expected"; then
  STAGE=
  if docker start "$CONTAINER_NAME" >/dev/null; then
    die "The swap failed, so $DB_PATH was not replaced; $CONTAINER_NAME runs again on it."
  fi
  die "The swap failed, so $DB_PATH was not replaced, and $CONTAINER_NAME did not start: run docker start $CONTAINER_NAME."
fi
STAGE=swapped

# 5. Start it, and wait for this start's line in its logs (the earlier starts' lines are there too).
say "Starting $CONTAINER_NAME"
if ! docker start "$CONTAINER_NAME" >/dev/null; then
  STAGE=
  die "$CONTAINER_NAME did not start on the restored database: run docker start $CONTAINER_NAME."
fi
STAGE=
started=$(docker inspect --format '{{.State.StartedAt}}' "$CONTAINER_NAME") ||
  die "Could not read when $CONTAINER_NAME started."
deadline=$((SECONDS + STARTUP_TIMEOUT_SECONDS))
while :; do
  logs=$(docker logs --since "$started" "$CONTAINER_NAME" 2>&1) || logs=
  case "$logs" in
    *"$STARTUP_LINE"*) break ;;
  esac
  state=$(docker inspect --format '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null) || state=unknown
  if [ "$state" != running ]; then
    die "$CONTAINER_NAME did not start (it is $state). Its last log lines:
$(docker logs --since "$started" --tail 20 "$CONTAINER_NAME" 2>&1 || true)"
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    die "$CONTAINER_NAME did not start within $STARTUP_TIMEOUT_SECONDS s. Its last log lines:
$(printf '%s\n' "$logs" | tail -n 20)"
  fi
  sleep 1
done

echo "Restore complete: $CONTAINER_NAME runs on $file."
