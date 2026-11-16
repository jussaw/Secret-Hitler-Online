#!/usr/bin/env bash
# Backs up the Secret Hitler Online database from its running container, for example nightly
# from cron. One consistent snapshot (VACUUM INTO) is taken inside the container while the
# server keeps writing, checked (PRAGMA integrity_check and its SHA-256, inside the container
# and again once copied out), and moved into BACKUP_DIR as secret-hitler-<UTC time>.db with a
# .sha256 beside it. Backups older than RETENTION_DAYS are deleted, and AFTER_BACKUP, if set,
# runs with the new backup's path as $1 (to copy it off this host, say).
#
# Usage: devops/backup-db.sh
#
# Settings come from the environment, then from devops/.env beside this script (or the file
# ENV_FILE names), then the defaults; devops/.env.example lists them. Needs only docker and
# sha256sum (or shasum). Exits 1 with "Error: ..." on stderr on any failure, leaving no backup
# behind if it failed before the backup was moved into place.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
SETTINGS="CONTAINER_NAME DB_PATH BACKUP_DIR RETENTION_DAYS AFTER_BACKUP"

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

# What the trap removes: the snapshot in the container, and the files on this host until each
# has been moved into place.
SNAPSHOT=
HOST_TMP=
SHA_TMP=
UNFINISHED=

remove_snapshot() {
  [ -n "$SNAPSHOT" ] || return 0
  if ! docker exec "$CONTAINER_NAME" rm -f "$SNAPSHOT" "$SNAPSHOT-wal" "$SNAPSHOT-shm" \
    "$SNAPSHOT-journal" >/dev/null 2>&1; then
    printf 'Warning: could not remove the snapshot %s from %s.\n' "$SNAPSHOT" "$CONTAINER_NAME" >&2
  fi
  SNAPSHOT=
}

cleanup() {
  local status=$?
  remove_snapshot
  [ -z "$HOST_TMP" ] || rm -f "$HOST_TMP"
  [ -z "$SHA_TMP" ] || rm -f "$SHA_TMP"
  [ -z "$UNFINISHED" ] || rm -f "$UNFINISHED"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

read_settings
CONTAINER_NAME=${CONTAINER_NAME:-secret-hitler-online}
DB_PATH=${DB_PATH:-/data/backup.db}
BACKUP_DIR=${BACKUP_DIR:-}
RETENTION_DAYS=${RETENTION_DAYS:-30}
AFTER_BACKUP=${AFTER_BACKUP:-}

[ -n "$BACKUP_DIR" ] || die "BACKUP_DIR is not set: name the directory that keeps the backups."
case "$BACKUP_DIR" in
  /*) ;;
  *) die "BACKUP_DIR must be an absolute path (it is '$BACKUP_DIR')." ;;
esac
[ -d "$BACKUP_DIR" ] || die "BACKUP_DIR $BACKUP_DIR is not an existing directory."
while [ "${BACKUP_DIR%/}" != "$BACKUP_DIR" ]; do
  BACKUP_DIR=${BACKUP_DIR%/}
done
whole_number RETENTION_DAYS
case "$DB_PATH" in
  /*\'* | /*$'\n'*) die "DB_PATH must not hold a quote or a line break (it is '$DB_PATH')." ;;
  /*) ;;
  *) die "DB_PATH must be an absolute path in the container (it is '$DB_PATH')." ;;
esac

stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="secret-hitler-$stamp.db"
backup="$BACKUP_DIR/$name"
if [ -e "$backup" ] || [ -e "$backup.sha256" ]; then
  die "$backup already exists: another backup ran this second."
fi

# 1. The container must be running.
running=$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null) || running=
[ "$running" = true ] || die "Container $CONTAINER_NAME is not running."

# 2. One consistent snapshot, beside the database in the container.
db_dir=$(dirname "$DB_PATH")
[ "$db_dir" != / ] || db_dir=
SNAPSHOT="$db_dir/.secret-hitler-backup-$stamp-$$.db"
snapshot=$SNAPSHOT
say "Taking a snapshot of $DB_PATH in $CONTAINER_NAME"
docker exec "$CONTAINER_NAME" sqlite3 -bail -cmd ".timeout 5000" "$DB_PATH" "VACUUM INTO '$snapshot'" ||
  die "The snapshot of $DB_PATH failed."

# 3. Its integrity and its SHA-256, inside the container.
check=$(docker exec "$CONTAINER_NAME" sqlite3 -bail "$snapshot" "PRAGMA integrity_check") ||
  die "Integrity check failed: sqlite3 could not check the snapshot."
[ "$check" = ok ] || die "Integrity check failed on the snapshot: $check"
sum=$(docker exec "$CONTAINER_NAME" sha256sum "$snapshot") || die "Could not take the snapshot's SHA-256."
sum=${sum%% *}
is_sha256 "$sum" || die "Could not take the snapshot's SHA-256 (got '$sum')."

# 4. Copied out, and checked again here.
HOST_TMP="$BACKUP_DIR/.secret-hitler-$stamp.db.$$.tmp"
say "Copying it to $BACKUP_DIR"
docker cp "$CONTAINER_NAME:$snapshot" "$HOST_TMP" >/dev/null || die "Copying the snapshot out failed."
copied=$(sha256_of "$HOST_TMP")
[ "$copied" = "$sum" ] || die "The copy's SHA-256 ($copied) does not match the snapshot's ($sum)."
remove_snapshot

# 5. Into place: the backup, then its checksum, each through a temporary file and mv. The name
# is claimed first (noclobber creates it only if it is not there), so two runs in one second
# never leave one's checksum beside the other's backup.
SHA_TMP="$BACKUP_DIR/.secret-hitler-$stamp.db.sha256.$$.tmp"
printf '%s  %s\n' "$sum" "$name" >"$SHA_TMP"
( set -o noclobber; : >"$backup" ) 2>/dev/null || die "$backup already exists: another backup ran this second."
UNFINISHED=$backup
mv -f "$HOST_TMP" "$backup"
HOST_TMP=
mv -f "$SHA_TMP" "$backup.sha256"
SHA_TMP=
UNFINISHED=
say "Saved $backup"

# 6. Backups older than RETENTION_DAYS, and nothing else.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'secret-hitler-*.db' -o -name 'secret-hitler-*.db.sha256' \) \
  -mmin +$((RETENTION_DAYS * 1440)) -delete ||
  die "Deleting backups older than $RETENTION_DAYS days failed; the new backup is $backup."

# 7. The hook, with the new backup's path as $1.
if [ -n "$AFTER_BACKUP" ]; then
  say "Running AFTER_BACKUP"
  hook_status=0
  sh -c "$AFTER_BACKUP" sh "$backup" || hook_status=$?
  [ "$hook_status" -eq 0 ] || die "AFTER_BACKUP failed (exit $hook_status); the backup is kept at $backup."
fi

echo "Backup complete: $backup"
