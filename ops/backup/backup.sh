#!/bin/sh
# Daily PostgreSQL backup:
#   1. logical dump (pg_dump -Fc)  -> /backups/daily, easy single-DB restore
#   2. physical base backup        -> /backups/base, start point for PITR with
#                                     the WAL archived continuously by the db
# Each file gets a .sha256. Files older than BACKUP_RETENTION_DAYS are pruned,
# and archived WAL older than the oldest kept base backup is pruned too.
# Requires PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
set -eu

retention="${BACKUP_RETENTION_DAYS:-7}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
root=/backups
mkdir -p "$root/daily" "$root/base" "$root/wal"

log() { echo "{\"level\":\"$1\",\"component\":\"backup\",\"message\":\"$2\"}"; }

dump="$root/daily/paynext-$stamp.dump"
pg_dump --format=custom --no-owner --file="$dump.tmp"
mv "$dump.tmp" "$dump"
(cd "$root/daily" && sha256sum "$(basename "$dump")" > "$(basename "$dump").sha256")
log info "logical dump written: $(basename "$dump") ($(du -h "$dump" | cut -f1))"

base_dir="$root/base/$stamp"
pg_basebackup --pgdata="$base_dir.tmp" --format=tar --gzip --wal-method=fetch --checkpoint=fast --label="paynext-$stamp"
mv "$base_dir.tmp" "$base_dir"
(cd "$base_dir" && sha256sum ./*.tar.gz > SHA256SUMS)
log info "base backup written: base/$stamp"

find "$root/daily" -type f -mtime +"$retention" -delete
find "$root/base" -mindepth 1 -maxdepth 1 -type d -mtime +"$retention" -exec rm -rf {} +
oldest_base="$(find "$root/base" -mindepth 1 -maxdepth 1 -type d | sort | head -n 1)"
if [ -n "$oldest_base" ]; then
  find "$root/wal" -type f ! -newer "$oldest_base" -delete
fi
log info "retention applied (${retention} days)"
