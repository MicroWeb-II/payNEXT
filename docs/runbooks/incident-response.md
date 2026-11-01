# Incident response

## Severity

| Level | Examples | Response |
| --- | --- | --- |
| SEV1 | Wrong balances, money moved twice, data exposed, site down | Start now, all hands, freeze deploys |
| SEV2 | A money flow failing for some users, elevated 5xx, backups failing | Start within 1 hour |
| SEV3 | Cosmetic or single-user issues | Next working day |

## First 15 minutes

1. **Declare it.** Name an incident lead and open a shared notes log with
   timestamps. Freeze deploys to the affected environment.
2. **Assess.**
   ```bash
   cd /opt/paynext
   ops/deploy/deploy.sh status
   docker compose ps
   docker compose logs --since 30m api | grep '"level":"error"'   # 5xx and unhandled errors
   curl -fsS https://${DOMAIN}/api/v1/health
   ```
   Every API log line carries `requestId`, `userId`, `endpoint`, `status`
   and `latencyMs`; clients see the same `X-Request-Id`, so ask affected
   users for it.
3. **Mitigate before you diagnose.**
   - A new release is the cause or suspect: roll back ([rollback.md](rollback.md)).
   - A specific wallet is being abused: an admin freezes it with
     `POST /api/v1/admin/wallets/:id/freeze` (recorded in the audit log).
   - A user account is compromised: set `users.status` to `suspended`.
     Every request re-reads the user from the database, so the account is
     blocked on its next call, and refresh is refused. Changing a user's role
     through `PATCH /api/v1/admin/users/:id/role` also revokes all of their
     refresh tokens.
   - Credential or secret leak: rotate it (below).

## Money incidents

- Never edit `wallets.balance` or `transactions` by hand. Corrections go
  through `POST /api/v1/admin/wallets/:id/adjustments` with a reason, so
  the ledger and the audit log stay consistent.
- The audit log is append-only (database triggers block UPDATE, DELETE and
  TRUNCATE). Query it with `GET /api/v1/admin/audit-log` or `psql`.
- Check ledger consistency at any time: run `ops/backup/verify-restore.sh`
  against a fresh dump; it compares every balance with its last ledger entry.

## Rotating secrets

| Secret | How | Effect |
| --- | --- | --- |
| `JWT_SECRET` | Update the GitHub environment secret, redeploy the current SHA | All sessions end; users sign in again |
| `DB_PASSWORD` | `ALTER ROLE ... PASSWORD`, update the secret, redeploy | Brief API restart |
| SSH deploy key | New key pair, update `authorized_keys` and `SSH_PRIVATE_KEY` | None |
| `METRICS_TOKEN` | Update the secret, redeploy, update the scraper | None |

## Afterwards

Within five working days, write a blameless review: timeline, impact (users,
amounts), root cause, what went well, and follow-up actions with owners. Add
a regression test for the cause where possible.
