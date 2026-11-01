#!/usr/bin/env bash
# Verify that a logical backup restores cleanly into a scratch database.
#
#   ops/backup/verify-restore.sh [path/to/backup.dump]
#
# Defaults to the newest dump in ${BACKUP_DIR:-./backups}/daily. Starts a
# throwaway PostgreSQL container (never touches the live database), restores
# the dump, and checks schema, row counts and ledger consistency. Exits
# non-zero on any failure.
set -euo pipefail

backup_dir="${BACKUP_DIR:-./backups}"
dump="${1:-$(ls -1t "$backup_dir"/daily/*.dump 2>/dev/null | head -n 1 || true)}"
if [[ -z "$dump" || ! -f "$dump" ]]; then
  echo "No backup dump found (looked in $backup_dir/daily)." >&2
  exit 1
fi
if [[ -f "$dump.sha256" ]]; then
  (cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256")
fi

name="paynext-restore-check-$$"
password="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting scratch PostgreSQL container $name"
docker run -d --name "$name" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=restore_check postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d restore_check >/dev/null 2>&1 && break
  sleep 1
done

echo "Restoring $(basename "$dump")"
docker exec -i "$name" pg_restore --no-owner --exit-on-error -U postgres -d restore_check < "$dump"

psql_check() { docker exec -i "$name" psql -U postgres -d restore_check -v ON_ERROR_STOP=1 -At -c "$1"; }

echo "Checking schema"
for table in users wallets transactions transfers payment_requests audit_log idempotency_keys refresh_tokens pgmigrations; do
  psql_check "SELECT to_regclass('public.$table') IS NOT NULL" | grep -qx t || { echo "missing table: $table" >&2; exit 1; }
done

echo "Row counts"
psql_check "SELECT 'users=' || COUNT(*) FROM users UNION ALL SELECT 'wallets=' || COUNT(*) FROM wallets UNION ALL SELECT 'transactions=' || COUNT(*) FROM transactions UNION ALL SELECT 'audit_log=' || COUNT(*) FROM audit_log"

echo "Checking ledger consistency (latest balance_after equals wallet balance)"
mismatches="$(psql_check "
  SELECT COUNT(*) FROM wallets w
  JOIN LATERAL (
    SELECT balance_after FROM transactions t WHERE t.wallet_id = w.id ORDER BY created_at DESC, id DESC LIMIT 1
  ) last ON TRUE
  WHERE last.balance_after <> w.balance")"
if [[ "$mismatches" != "0" ]]; then
  echo "ledger mismatch in $mismatches wallet(s)" >&2
  exit 1
fi

echo "Restore verified: $(basename "$dump")"
