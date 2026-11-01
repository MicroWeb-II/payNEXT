# Restore the database

The `backup` service writes two kinds of backup to `${BACKUP_DIR}` (default
`/opt/paynext/backups`) every day at `BACKUP_SCHEDULE` (default 02:00 UTC):

| Path | What | Use for |
| --- | --- | --- |
| `daily/paynext-<stamp>.dump` | Logical `pg_dump -Fc` with `.sha256` | Simple whole-database restore |
| `base/<stamp>/` | Physical base backup (`base.tar.gz` including the WAL it needs, `SHA256SUMS`) | Start point for point-in-time recovery |
| `wal/*.gz` | WAL segments archived continuously (at least every 15 minutes) | Replaying up to a chosen moment |

Files older than `BACKUP_RETENTION_DAYS` (default 7) are pruned. Copy the
backup directory off the host as well (object storage or another machine);
a backup on the same disk does not survive losing the host.

## Monthly restore drill (no impact on the live database)

```bash
cd /opt/paynext
ops/backup/verify-restore.sh                       # newest dump
ops/backup/verify-restore.sh backups/daily/paynext-20260101T020000Z.dump
```

The script checks the checksum, restores into a throwaway container, and
verifies the schema, row counts, and that every wallet balance matches its
last ledger entry. Record the date and
result in your ops log.

To run a backup on demand: `docker compose exec backup /bin/sh /ops/backup/backup.sh`.

## Option A: restore a logical dump

Use this when losing changes since the dump is acceptable.

```bash
cd /opt/paynext
set -a; . ./.env; set +a
dump=backups/daily/paynext-<stamp>.dump
(cd backups/daily && sha256sum -c "$(basename "$dump").sha256")

docker compose stop api                       # stop writes
docker compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${DB_NAME}_old" \
  -c "ALTER DATABASE ${DB_NAME} RENAME TO ${DB_NAME}_old" \
  -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"
docker compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error < "$dump"
docker compose start api
curl -fsS "https://${DOMAIN}/api/v1/health"
```

Keep `${DB_NAME}_old` until you have confirmed the restore, then drop it.

## Option B: point-in-time recovery

Use this to recover to a moment just before an incident (for example a bad
bulk change at 14:05 UTC).

1. Stop the stack and keep a copy of the current data in a separate volume,
   so nothing is lost if you need to start again:
   ```bash
   cd /opt/paynext
   docker compose stop api backup db
   docker volume create paynext_postgres_data_broken
   docker run --rm -v paynext_postgres_data:/from:ro -v paynext_postgres_data_broken:/to \
     postgres:16-alpine sh -c 'cp -a /from/. /to/'
   ```
2. Pick the newest base backup taken **before** the target time, check it,
   and unpack it into the emptied data volume with recovery settings. Do not
   start `db` until `recovery.signal` is in place: a database started from a
   bare base backup writes new WAL into the archive.
   ```bash
   stamp=<base backup stamp>
   target='2026-01-01 14:04:00+00'
   (cd backups/base/$stamp && sha256sum -c SHA256SUMS)
   docker run --rm -v paynext_postgres_data:/data -v "$PWD/backups:/backups:ro" \
     -e STAMP="$stamp" -e TARGET="$target" postgres:16-alpine sh -c '
       set -e
       find /data -mindepth 1 -delete
       tar -xzf /backups/base/$STAMP/base.tar.gz -C /data
       printf "%s\n" \
         "restore_command = '"'"'gunzip -c /backups/wal/%f.gz > %p'"'"'" \
         "recovery_target_time = '"'"'$TARGET'"'"'" \
         "recovery_target_action = '"'"'promote'"'"'" >> /data/postgresql.auto.conf
       touch /data/recovery.signal
       chown -R 70:70 /data && chmod 700 /data'
   ```
3. Start only the database and watch it replay WAL:
   ```bash
   docker compose up -d db
   docker compose logs -f db   # wait for "database system is ready to accept connections"
   ```
4. Check the data (balances, latest transactions, audit log), then start the
   rest with `docker compose up -d`.
5. PostgreSQL removes `recovery.signal` when it promotes, and the recovery
   settings left in `postgresql.auto.conf` are then ignored; delete them at the
   next maintenance window. Take a fresh backup straight away
   (`docker compose exec backup /bin/sh /ops/backup/backup.sh`), because the
   database is now on a new timeline, and drop `paynext_postgres_data_broken`
   once you are sure.

This procedure was exercised end to end on a local copy of the stack: rows
committed before the target time were recovered and later ones were not.
Practice it on staging before you need it in production.
