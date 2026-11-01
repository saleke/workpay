#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.production"
COMPOSE_FILE="$DEPLOY_DIR/compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

read -r -s -p "Temporary password for seeded test users: " DEMO_PASSWORD
echo
if [[ ${#DEMO_PASSWORD} -lt 16 ]]; then
  echo "Use a password of at least 16 characters." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm \
  -e WORKPAY_DEMO_PASSWORD="$DEMO_PASSWORD" \
  migrate pnpm --filter @workpay/shared db:seed
unset DEMO_PASSWORD

echo "Seeded buyer@example.com, provider@example.com, and reviewer@example.com."
