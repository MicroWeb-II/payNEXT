# Security in payNEXT

This document describes the controls in place and how to report a problem.

## Reporting a vulnerability

Please do not open a public issue. Email the maintainers or use GitHub's
private vulnerability reporting on this repository, with steps to reproduce.
We aim to reply within three working days.

## Transport and browser

- Caddy provisions Let's Encrypt certificates, redirects HTTP to HTTPS, and
  sends HSTS. It strips `Server` and `X-Powered-By` and returns 404 for
  `/metrics` from the internet.
- The web container sends a strict Content Security Policy (`script-src 'self'`,
  no inline scripts), `X-Frame-Options: DENY`, `nosniff`, a strict referrer
  policy and a restrictive `Permissions-Policy`. The API sets equivalent
  headers with `helmet`.
- The frontend renders user data with `textContent`, never `innerHTML`.
- CORS is closed by default; `ALLOWED_ORIGINS` lists exact origins. Disallowed
  origins get `403`.

## Authentication and sessions

- Passwords are hashed with bcrypt (cost 12 or more). They must be 8 to 72
  bytes and include a letter and a number. Login takes the same time whether
  or not the email exists.
- Access tokens are HS256 JWTs valid for 15 minutes, with issuer, audience
  and type checks. `JWT_SECRET` must be at least 32 bytes in production; the
  API refuses to start otherwise.
- Refresh tokens are random, stored only as SHA-256 hashes, sent in an
  `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/v1/auth`,
  and rotated on every use. Reusing an old refresh token revokes the whole
  token family. Logout revokes the token; a role change revokes all of the
  user's tokens.
- The access token lives in `sessionStorage`, not `localStorage`.
- Every authenticated request re-reads the user from the database, so
  suspensions and role changes apply immediately.

## Authorization

- Users can only read and move money from wallets they own; other wallets
  return `404` rather than revealing that they exist.
- Payment requests are visible only to their two participants. Only the
  requester can edit or cancel, and only the payer can approve or decline.
- Merchant management and all `/admin` endpoints require the `admin` role.
  Merchant API keys are shown only to admins.

## Money integrity

- Amounts are validated as decimal strings and computed with PostgreSQL
  `NUMERIC`, never JavaScript floats.
- Each movement runs in one transaction that locks the wallets involved in a
  fixed order (avoiding deadlocks), checks status and balance under the lock,
  writes the ledger row and the audit row, and retries on serialization
  failures.
- `Idempotency-Key` is required on money-moving requests and is scoped to the
  user and endpoint, with a request hash and a 24-hour retention.

## Abuse protection

- Rate limits per IP and per user on login (also per email), registration,
  refresh, money movement, writes and reads. The limiter uses an in-memory
  store, so limits are per API instance; use a shared store (for example
  Redis) before running more than one instance.
- JSON bodies are limited to 20 KB. All input passes `express-validator`, and
  handlers read only validated fields; amounts are re-validated in the
  service layer.
- All SQL is parameterized.

## Audit and observability

- The `audit_log` table is append-only: database triggers reject `UPDATE`,
  `DELETE` and `TRUNCATE`. When a `paynext_app` database role exists, it is
  granted `INSERT` and `SELECT` only on that table.
- Logs are JSON with a request ID on every line and in the `X-Request-Id`
  response header. Passwords, tokens, cookies and authorization headers are
  redacted.
- `/metrics` can additionally require a bearer token (`METRICS_TOKEN`).

## Secrets and supply chain

- Secrets come from GitHub Environment secrets and are written to
  `/opt/paynext/.env` on the host by the deploy job. `.env` files are ignored
  by Git and never included in the deploy bundle or images.
- Images run as a non-root user, are tagged with the Git SHA (never
  `latest`), and must pass Trivy (no fixable HIGH or CRITICAL findings) before
  they are pushed. `npm audit --omit=dev` gates high-severity dependencies.
- An OWASP ZAP baseline scan runs against staging after each deploy and
  weekly, and fails on High alerts.

See [docs/runbooks/incident-response.md](docs/runbooks/incident-response.md)
for rotating secrets and handling incidents.
