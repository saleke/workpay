#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git jq unzip unattended-upgrades
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sh /tmp/get-docker.sh
rm -f /tmp/get-docker.sh
systemctl enable --now docker

if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi

if snap list amazon-ssm-agent >/dev/null 2>&1; then
  snap start amazon-ssm-agent >/dev/null
fi

DEPLOY_USER="${SUDO_USER:-ubuntu}"
usermod -aG docker "$DEPLOY_USER"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0750 /opt/workpay
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 /opt/workpay-backups

cat <<EOF
Docker and AWS CLI are installed and /opt/workpay is ready.
Reconnect the Session Manager shell so Docker group membership takes effect.
EOF
