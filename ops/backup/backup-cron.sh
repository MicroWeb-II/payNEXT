#!/bin/sh
# Backup sidecar entrypoint: schedule backup.sh with busybox crond.
set -eu
schedule="${BACKUP_SCHEDULE:-0 2 * * *}"
mkdir -p /backups/daily /backups/base /backups/wal
# The postgres server process (uid 70) writes archived WAL here.
chown 70:70 /backups/wal
env | grep -E '^(PG|BACKUP_)' | sed 's/^/export /; s/=\(.*\)$/="\1"/' > /tmp/backup.env
echo "$schedule . /tmp/backup.env; /bin/sh /ops/backup/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "{\"level\":\"info\",\"message\":\"backup scheduler started\",\"schedule\":\"$schedule\"}"
exec crond -f -l 8
