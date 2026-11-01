# payNEXT runbooks

| Runbook | Use it when |
| --- | --- |
| [deploy-staging.md](deploy-staging.md) | Setting up the staging host for the first time, or deploying a release by hand |
| [rollback.md](rollback.md) | A release is unhealthy or misbehaving and you need the previous one back |
| [restore-database.md](restore-database.md) | Data was lost or corrupted, or you are running the monthly restore drill |
| [incident-response.md](incident-response.md) | Something is wrong in staging or production and you need a process |

All commands assume the deployment directory `/opt/paynext` (the `DEPLOY_PATH`
repository variable) and a shell user in the `docker` group.
