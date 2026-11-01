#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.production"
COMPOSE_FILE="$DEPLOY_DIR/compose.production.yml"
BACKUP_DIR="${BACKUP_DIR:-/opt/workpay-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

install -d -m 0700 "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/workpay-$TIMESTAMP.sql.gz"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-privileges -U workpay -d workpay \
  | gzip -9 > "$TARGET"
chmod 600 "$TARGET"
find "$BACKUP_DIR" -type f -name 'workpay-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Created $TARGET"
