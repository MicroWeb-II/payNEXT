#!/usr/bin/env bash
# payNEXT host-side deploy, rollback and status.
#
#   ops/deploy/deploy.sh deploy <image-tag>   pull and start that release
#   ops/deploy/deploy.sh rollback [image-tag] return to the previous (or given) release
#   ops/deploy/deploy.sh status               show current/previous release and health
#
# Run from the deployment directory (default /opt/paynext) that contains
# docker-compose.yml, Caddyfile, ops/ and the secret-bearing .env written by CI.
# Releases are immutable image tags (Git SHAs); "latest" is refused.
# If the new release does not become healthy it is rolled back automatically.
set -euo pipefail

cd "${PAYNEXT_HOME:-$(dirname "$0")/../..}"
STATE_DIR=.release
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
mkdir -p "$STATE_DIR"

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f .env ]] || die ".env is missing; it is written by the CI deploy job"

current() { cat "$STATE_DIR/current" 2>/dev/null || true; }
previous() { cat "$STATE_DIR/previous" 2>/dev/null || true; }

validate_tag() {
  local tag="$1"
  [[ -n "$tag" ]] || die "an image tag is required"
  [[ "$tag" != "latest" ]] || die "refusing to deploy the mutable 'latest' tag"
  [[ "$tag" =~ ^[A-Za-z0-9_.-]{1,128}$ ]] || die "invalid image tag: $tag"
}

set_env_tag() {
  local tag="$1"
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${tag}/" .env
  else
    printf 'IMAGE_TAG=%s\n' "$tag" >> .env
  fi
}

prepare_dirs() {
  local dir
  dir="$(grep -E '^BACKUP_DIR=' .env | cut -d= -f2- || true)"
  dir="${dir:-./backups}"
  mkdir -p "$dir/daily" "$dir/base" "$dir/wal"
  # The PostgreSQL server (uid 70 in the alpine image) writes archived WAL.
  chown 70:70 "$dir/wal" 2>/dev/null || true
}

# Wait until every app container runs the expected image and reports healthy.
wait_healthy() {
  local tag="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) service id image state
  for service in api web; do
    while :; do
      id="$(docker compose ps -q "$service" 2>/dev/null || true)"
      image="$(docker inspect -f '{{.Config.Image}}' "$id" 2>/dev/null || echo none)"
      state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
      if [[ "$image" == *":$tag" && "$state" == "healthy" ]]; then
        log "$service is healthy on $tag"
        break
      fi
      if (( SECONDS >= deadline )); then
        log "$service did not become healthy on $tag (image: $image, state: $state)"
        return 1
      fi
      sleep 3
    done
  done
}

registry() { grep -E '^IMAGE_REGISTRY=' .env | cut -d= -f2- || echo paynext; }

# Use images already on the host (e.g. the previous release during a
# rollback) and pull only what is missing.
ensure_images() {
  local tag="$1" component ref
  for component in api web; do
    ref="$(registry)/paynext-${component}:${tag}"
    if docker image inspect "$ref" >/dev/null 2>&1; then
      log "using local image $ref"
    else
      log "pulling $ref"
      docker pull --quiet "$ref" >/dev/null || { log "image pull failed for $ref"; return 1; }
    fi
  done
}

# Start a release. Every step checks its own status because callers use this
# in an `if`, where `set -e` does not apply.
start_release() {
  local tag="$1"
  validate_tag "$tag"
  set_env_tag "$tag" || return 1
  prepare_dirs || return 1
  ensure_images "$tag" || return 1
  log "starting $tag"
  IMAGE_TAG="$tag" docker compose up -d --no-build --remove-orphans || { log "docker compose up failed for $tag"; return 1; }
  docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || { log "Caddyfile is invalid"; return 1; }
  wait_healthy "$tag"
}

prune_images() {
  local keep_current keep_previous
  keep_current="$(current)"
  keep_previous="$(previous)"
  docker image ls --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^$(registry)/paynext-(api|web):" \
    | grep -v -E ":(${keep_current:-none}|${keep_previous:-none})$" \
    | xargs -r docker image rm >/dev/null 2>&1 || true
}

cmd_deploy() {
  local tag="$1" old
  old="$(current)"
  if [[ "$tag" == "$old" ]]; then
    log "$tag is already current; restarting it"
  fi
  if start_release "$tag"; then
    if [[ "$tag" != "$old" ]]; then
      [[ -n "$old" ]] && echo "$old" > "$STATE_DIR/previous"
      echo "$tag" > "$STATE_DIR/current"
    fi
    echo "$(date -u +%FT%TZ) deploy $tag (previous: ${old:-none})" >> "$STATE_DIR/history"
    prune_images
    log "deployed $tag"
    return 0
  fi
  log "release $tag is unhealthy"
  docker compose logs --tail=80 api || true
  if [[ -n "$old" && "$old" != "$tag" ]]; then
    log "automatic rollback to $old"
    start_release "$old" || die "rollback to $old also failed; manual intervention required"
    set_env_tag "$old"
    echo "$(date -u +%FT%TZ) auto-rollback $tag -> $old" >> "$STATE_DIR/history"
  fi
  die "deploy of $tag failed"
}

cmd_rollback() {
  local target="${1:-$(previous)}" old
  old="$(current)"
  [[ -n "$target" ]] || die "no previous release recorded; pass an image tag explicitly"
  log "rolling back from ${old:-none} to $target"
  start_release "$target" || die "rollback to $target failed"
  echo "$target" > "$STATE_DIR/current"
  [[ -n "$old" && "$old" != "$target" ]] && echo "$old" > "$STATE_DIR/previous"
  echo "$(date -u +%FT%TZ) rollback ${old:-none} -> $target" >> "$STATE_DIR/history"
  log "now running $target"
}

cmd_status() {
  echo "current:  $(current)"
  echo "previous: $(previous)"
  docker compose ps
}

case "${1:-}" in
  deploy) cmd_deploy "${2:-}" ;;
  rollback) cmd_rollback "${2:-}" ;;
  status) cmd_status ;;
  *) echo "usage: $0 {deploy <tag>|rollback [tag]|status}" >&2; exit 2 ;;
esac
