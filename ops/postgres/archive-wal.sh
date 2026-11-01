#!/bin/sh
# PostgreSQL archive_command: copy a completed WAL segment to /backups/wal,
# compressed, atomically, and never overwrite an existing archive.
set -eu
src="$1"
name="$2"
dest_dir=/backups/wal
mkdir -p "$dest_dir"
[ -f "$dest_dir/$name.gz" ] && exit 0
gzip -c "$src" > "$dest_dir/$name.gz.tmp"
mv "$dest_dir/$name.gz.tmp" "$dest_dir/$name.gz"
