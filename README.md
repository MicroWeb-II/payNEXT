<div align="center">

<img src="assets/payNEXT_logo.png" alt="Project Logo" width="180"/>

# payNEXT

**payNEXT is a next-generation digital wallet platform.**

</div>

## 📖 About The Project

payNEXT is a digital wallet platform developed for Web Programming Lab II.

The project uses an MVC-based backend and provides API-driven features for common wallet operations, including:

- Wallet balance management
- Transaction history
- Peer-to-peer money requests
- Merchant payments
- User authentication

The application runs as a Docker-based multi-container system.

## ✨ Features

- 💳 **Wallets**: one wallet per currency (USD, BDT), top-up, withdrawal, peer-to-peer transfers and merchant payments.
- 🧾 **Ledger**: every movement writes an immutable ledger row with the resulting balance; amounts use exact `NUMERIC` arithmetic.
- 🤝 **Payment requests**: request money from another user, who can approve or decline.
- 🔐 **Sessions**: 15-minute access tokens plus rotating, revocable refresh tokens in an httpOnly cookie.
- 🛡️ **Admin tools**: role changes, wallet freeze and unfreeze, balance adjustments with a reason, and an append-only audit log.
- 🔁 **Safe retries**: money endpoints take an `Idempotency-Key`, so a retried request never moves money twice.
- 📈 **Operations**: JSON logs with request IDs, Prometheus metrics, graceful shutdown, daily backups with point-in-time recovery.

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript served by Nginx
- **Backend**: Node.js 24, Express 4, MVC with a service layer
- **Database**: PostgreSQL 16 with versioned `node-pg-migrate` migrations
- **Reverse proxy**: Caddy 2 with automatic HTTPS (Let's Encrypt)
- **Tests**: Jest + Supertest against a real PostgreSQL, Playwright end-to-end
- **Delivery**: Docker Compose, GitHub Actions, GHCR images tagged with the Git SHA, Trivy, OWASP ZAP

## 🏗️ Architecture

```text
Browser ──HTTPS──► Caddy ──┬── /api/* ──► api (Node/Express) ──► db (PostgreSQL 16)
                           │                                        │
                           └── /*  ─────► web (Nginx, static UI)     └─► backup (pg_dump, base backups, WAL)
```

- **Caddy** terminates TLS, redirects HTTP to HTTPS, adds HSTS, hides `/metrics`, and routes traffic.
- **web** serves the single-page frontend with a strict Content Security Policy.
- **api** runs migrations on start, then serves `/api/v1`. It logs JSON to stdout and exposes `/healthz`, `/api/v1/health` and `/metrics`.
- **db** archives WAL continuously; **backup** takes a logical dump and a base backup every day.

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) with the Compose plugin
- [Node.js 24](https://nodejs.org/) for running the API and tests outside Docker
- [Git](https://git-scm.com/)

### Run the full stack locally

```bash
cp .env.example .env            # DOMAIN=localhost, IMAGE_TAG=local
# set DB_PASSWORD and JWT_SECRET (openssl rand -base64 48) in .env
docker compose up -d --build
```

Open <https://localhost> (Caddy uses its internal CA for `localhost`, so accept the certificate warning). To make yourself an admin after registering:

```bash
docker compose exec api node scripts/promote-admin.js you@example.com
```

Stop with `docker compose down`. Add `-v` only if you want to delete the local database.

### Tests

From `server/`:

```bash
npm ci
npm run test:db:up                       # disposable PostgreSQL on port 55432
export DB_HOST=localhost DB_PORT=55432 DB_USER=paynext_test DB_PASSWORD=paynext_test DB_NAME=paynext_test
npm run test:ci                          # Jest, serial, with the coverage gate
npx playwright install chromium
npm run test:e2e                         # browser smoke test of the main money flow
npm run test:db:down
```

The coverage gate fails the run below 80% statements and lines (85% for `src/services/`).

## 📚 API overview

All endpoints are under `/api/v1`. Responses are `{ "success": true, "data": ... }` or `{ "success": false, "error": "...", "requestId": "..." }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Wallets | `GET/POST /wallets`, `GET /wallets/:id`, `GET /wallets/:id/balance`, `GET /wallets/:id/transactions`, `POST /wallets/:id/top-up`, `POST /wallets/:id/withdraw` |
| Transfers | `POST /transfers` |
| History | `GET /history?walletId=&type=&limit=&offset=` |
| Payment requests | `GET/POST /payment-requests`, `GET/PUT/DELETE /payment-requests/:id`, `POST /payment-requests/:id/approve`, `POST /payment-requests/:id/decline` |
| Merchants | `GET /merchants`, `GET /merchants/:id`, `POST /merchants/pay`; admin: `POST /merchants`, `PUT/DELETE /merchants/:id` |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id/role`, `POST /admin/wallets/:id/freeze`, `POST /admin/wallets/:id/unfreeze`, `POST /admin/wallets/:id/adjustments`, `GET /admin/audit-log` |

Login and register return `{ user, token, tokenType, expiresIn }` and set the refresh cookie. Send the token as `Authorization: Bearer <token>`. Amounts are decimal strings with at most two decimals, for example `"25.50"`.

Money-moving `POST`s (top-up, withdraw, transfers, merchant payments, approving a request, admin adjustments) require an `Idempotency-Key` header (8 to 255 printable characters). Replaying the same key with the same body returns the original response; a different body returns `409`.

## 🔄 Branches and delivery

Work happens on `devs`, is merged into `release` for testing, and reaches `main` only after the test suite passes. On every push and pull request, GitHub Actions validates the configuration and runs Jest, Playwright and `npm audit`, then builds both images and scans them with Trivy. On `main`, it pushes `ghcr.io/<owner>/paynext-{api,web}:<git-sha>`, deploys that SHA to **staging** with smoke tests and automatic rollback, and runs an OWASP ZAP baseline scan. Production is promoted by hand with the **Deploy** workflow.

Operational procedures live in [`docs/runbooks`](docs/runbooks/README.md): staging setup, rollback, database restore and incident response. Security details are in [SECURITY.md](SECURITY.md).

payNEXT - Powering Your Next Move. Next Generation Digital Wallet.
