# Roll back a release

Every release is an immutable pair of images tagged with a Git SHA, so a
rollback is just starting an older tag. Database migrations are additive and
backward compatible within Phase 1, so the previous API image runs against
the current schema.

## Automatic rollback

You usually do not need to act:

- `deploy.sh` rolls back if the new API container does not become healthy
  within `HEALTH_TIMEOUT` seconds (default 180).
- The Deploy workflow rolls back if the public smoke tests fail after a
  deploy.

Both cases are visible in the workflow run summary.

## Manual rollback from GitHub

**Actions → Deploy → Run workflow**, then choose the environment and
`action: rollback`. Leave `image_tag` empty to return to the previous
release, or give a specific SHA.

## Manual rollback on the host

```bash
cd /opt/paynext
ops/deploy/deploy.sh status              # current, previous and recent history
ops/deploy/deploy.sh rollback            # back to the previous release
ops/deploy/deploy.sh rollback <sha>      # or to a specific earlier release
ops/deploy/deploy.sh status
```

Then repeat the checks from [deploy-staging.md](deploy-staging.md#checks-after-a-deploy).

## If a migration is the problem

Do not run down-migrations against a database with real data. Restore from
backup instead ([restore-database.md](restore-database.md)), or write a new
forward migration that fixes the schema and ship it as a new release.

## Verifying rollback on a new environment

Do this once per environment, before you rely on it:

1. Deploy SHA A, then SHA B.
2. Run `ops/deploy/deploy.sh rollback` and confirm `status` shows A as
   current and the health checks pass.
3. Deploy B again.
