# Deploy to staging

Staging runs the same Docker Compose stack as production (Caddy, nginx web,
Node API, PostgreSQL 16, backup sidecar) on its own host, with its own
database and its own secrets. Nothing is shared with production.

## How a release reaches staging

1. A change lands on `devs`, is merged into `release`, and then into `main`.
2. On `main`, the **payNEXT CI/CD** workflow runs: config validation, Jest with
   coverage gate, Playwright e2e, `npm audit --omit=dev`, image builds, and a
   Trivy scan that fails on fixable HIGH/CRITICAL findings.
3. Images are pushed to GHCR tagged with the full Git SHA
   (`ghcr.io/<owner>/paynext-api:<sha>`, `ghcr.io/<owner>/paynext-web:<sha>`).
   The `latest` tag is never built or deployed.
4. The **Deploy** workflow deploys that SHA to the `staging` environment,
   runs smoke tests (`/healthz` and `/api/v1/health` with a database check),
   and rolls back automatically if they fail.
5. The **ZAP baseline** workflow then scans staging and fails on High alerts.

Production is never deployed automatically. Promote a SHA that passed on
staging with **Actions → Deploy → Run workflow** (`environment: production`,
`action: deploy`, `image_tag: <sha>`).

## One-time setup

### 1. Provision the host

- Ubuntu 24.04 LTS (or similar), 2 vCPU / 4 GB RAM / 40 GB disk minimum.
- Open inbound 22 (restrict to your IPs if possible), 80 and 443 (TCP) and 443/UDP.
- Install Docker Engine with the Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker deploy   # the SSH user CI will use
  ```
- Create the deployment directory:
  ```bash
  sudo mkdir -p /opt/paynext && sudo chown deploy:deploy /opt/paynext
  ```

### 2. DNS

Point an A (and AAAA, if you have IPv6) record for the staging hostname, for
example `staging.example.com`, at the host. Caddy requests the Let's Encrypt
certificate on first start, so DNS must resolve before the first deploy.

### 3. SSH key for CI

```bash
ssh-keygen -t ed25519 -f paynext-staging-deploy -C "paynext staging deploy" -N ""
ssh-copy-id -i paynext-staging-deploy.pub deploy@<staging-host>
ssh-keyscan -H <staging-host>       # value for SSH_KNOWN_HOSTS
```

### 4. GitHub environment and secrets

In **Settings → Environments**, create `staging` (and `production`, with
required reviewers). Add these **environment secrets** to `staging`:

| Secret | Value |
| --- | --- |
| `SSH_HOST` | Staging host name or IP |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Contents of `paynext-staging-deploy` |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H` (strongly recommended) |
| `DOMAIN` | `staging.example.com` |
| `DB_USER` | e.g. `paynext_staging` |
| `DB_PASSWORD` | `openssl rand -base64 32` |
| `DB_NAME` | e.g. `paynext_staging` |
| `JWT_SECRET` | `openssl rand -base64 48` (at least 32 bytes; never reuse production's) |

Optional: `WWW_DOMAIN`, `ALLOWED_ORIGINS`, `METRICS_TOKEN`, `DB_HOST` and
`DB_SSL` (only for a managed database instead of the bundled container).
Optional repository variable: `DEPLOY_PATH` (defaults to `/opt/paynext`).

If any required secret is missing, the Deploy job is skipped with a warning
instead of failing, so CI stays green until staging exists.

### 5. Container registry access

The workflow logs the host into GHCR with the run's short-lived
`GITHUB_TOKEN` and logs out afterwards. Make sure the `paynext-api` and
`paynext-web` packages allow this repository's Actions access
(**Package settings → Manage Actions access**).

### 6. First deploy and first admin

Run **Actions → Deploy → Run workflow** with `environment: staging`,
`action: deploy` and the SHA of the latest green `main` commit. Then create
the first admin from an account registered through the UI:

```bash
cd /opt/paynext
docker compose exec api node scripts/promote-admin.js admin@example.com
```

## Deploying by hand

Only for emergencies; CI is the normal path.

```bash
cd /opt/paynext
ops/deploy/deploy.sh deploy <full-git-sha>
ops/deploy/deploy.sh status
```

`deploy.sh` pulls the SHA-tagged images, starts the stack, waits for the
API health check on the new image, and rolls back to the previous release if
it does not become healthy. Release history lives in `.release/`.

## Checks after a deploy

```bash
curl -fsS https://staging.example.com/healthz
curl -fsS https://staging.example.com/api/v1/health      # "database": "ok"
curl -sI http://staging.example.com | head -n 3            # 308 to https
curl -s -o /dev/null -w '%{http_code}\n' https://staging.example.com/metrics   # 404
docker compose logs --since 10m api | tail -n 50           # JSON logs with requestId
```
