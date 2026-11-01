#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git jq unattended-upgrades
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sh /tmp/get-docker.sh
rm -f /tmp/get-docker.sh
systemctl enable --now docker

DEPLOY_USER="${SUDO_USER:-$USER}"
usermod -aG docker "$DEPLOY_USER"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0750 /opt/workpay

cat <<EOF
Docker is installed and /opt/workpay is ready.
Log out and reconnect so Docker group membership takes effect.
EOF
