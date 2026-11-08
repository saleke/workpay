#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

AWS_REGION="${AWS_REGION:-eu-north-1}"
INSTANCE_ID="${WORKPAY_INSTANCE_ID:-i-03486dbc4a3a23d5b}"
BRANCH="${WORKPAY_DEPLOY_BRANCH:-main}"
REMOTE="${WORKPAY_GIT_REMOTE:-origin}"
SERVER_REPO="${WORKPAY_SERVER_REPO:-/opt/workpay}"
ENV_PARAMETER="${WORKPAY_ENV_PARAMETER:-/workpay/test/environment}"
HEALTH_URL="${WORKPAY_HEALTH_URL:-https://workpay-beta.56.228.111.53.sslip.io/ready}"
DEPLOY_TIMEOUT_SECONDS="${WORKPAY_DEPLOY_TIMEOUT_SECONDS:-2100}"

for command in aws git python3 curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Deployment stopped: the working tree has uncommitted changes." >&2
  echo "Commit the exact version you want to deploy, then run this command again." >&2
  git status --short >&2
  exit 1
fi

git fetch "$REMOTE" "$BRANCH" --quiet
LOCAL_COMMIT="$(git rev-parse HEAD)"
REMOTE_COMMIT="$(git rev-parse "$REMOTE/$BRANCH")"
if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
  echo "Deployment stopped: local HEAD is not $REMOTE/$BRANCH." >&2
  echo "Local:  $LOCAL_COMMIT" >&2
  echo "Remote: $REMOTE_COMMIT" >&2
  echo "Push the commit (or update this checkout) before deploying." >&2
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  if [[ -t 0 ]]; then
    echo "AWS login has expired. Opening AWS login..."
    aws login
  else
    echo "AWS login has expired. Run 'aws login', then retry." >&2
    exit 1
  fi
fi

PAYLOAD_FILE="$(mktemp)"
trap 'rm -f "$PAYLOAD_FILE"' EXIT

export INSTANCE_ID AWS_REGION BRANCH REMOTE SERVER_REPO ENV_PARAMETER HEALTH_URL LOCAL_COMMIT
python3 >"$PAYLOAD_FILE" <<'PY'
import json
import os
import shlex
import sys

server_repo = os.environ["SERVER_REPO"]
branch = os.environ["BRANCH"]
remote = os.environ["REMOTE"]
commit = os.environ["LOCAL_COMMIT"]
region = os.environ["AWS_REGION"]
parameter = os.environ["ENV_PARAMETER"]

commands = [
    "set -euo pipefail",
    f"cd {shlex.quote(server_repo)}",
    "test -d .git",
    "test -z \"$(git status --porcelain --untracked-files=no)\"",
    f"git fetch {shlex.quote(remote)} {shlex.quote(branch)}",
    f"test \"$(git rev-parse {shlex.quote(f'{remote}/{branch}')})\" = {shlex.quote(commit)}",
    f"git pull --ff-only {shlex.quote(remote)} {shlex.quote(branch)}",
]

if parameter:
    commands.extend(
        [
            "ENV_TMP=$(mktemp)",
            "trap 'rm -f \"$ENV_TMP\"' EXIT",
            f"aws ssm get-parameter --region {shlex.quote(region)} --name {shlex.quote(parameter)} --with-decryption --query Parameter.Value --output text >\"$ENV_TMP\"",
            "chmod 600 \"$ENV_TMP\"",
            "mv \"$ENV_TMP\" deploy/.env.production",
            "trap - EXIT",
        ]
    )

commands.extend(
    [
        "./deploy/deploy.sh",
        f"test \"$(git rev-parse HEAD)\" = {shlex.quote(commit)}",
        f"curl -fsS --connect-timeout 5 --max-time 15 --retry 20 --retry-all-errors --retry-delay 2 --retry-max-time 120 {shlex.quote(os.environ['HEALTH_URL'])}",
    ]
)

remote_script = "\n".join(commands)
payload = {
    "DocumentName": "AWS-RunShellScript",
    "InstanceIds": [os.environ["INSTANCE_ID"]],
    "Comment": f"Deploy WorkPay {commit[:12]}",
    "Parameters": {
        "commands": [f"sudo -u ubuntu bash -lc {shlex.quote(remote_script)}"],
        "executionTimeout": ["1800"],
    },
}
json.dump(payload, sys.stdout)
PY

echo "Deploying commit ${LOCAL_COMMIT:0:12} to $INSTANCE_ID in $AWS_REGION..."
COMMAND_ID="$(
  AWS_PAGER='' aws ssm send-command \
    --region "$AWS_REGION" \
    --cli-input-json "file://$PAYLOAD_FILE" \
    --query 'Command.CommandId' \
    --output text
)"
echo "SSM command: $COMMAND_ID"

STARTED_AT="$SECONDS"
while true; do
  STATUS="$(
    AWS_PAGER='' aws ssm get-command-invocation \
      --region "$AWS_REGION" \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query Status \
      --output text 2>/dev/null || echo Pending
  )"
  case "$STATUS" in
    Success|Cancelled|Failed|TimedOut|Cancelling)
      break
      ;;
  esac
  if (( SECONDS - STARTED_AT > DEPLOY_TIMEOUT_SECONDS )); then
    echo "Deployment status check timed out after ${DEPLOY_TIMEOUT_SECONDS}s." >&2
    echo "Inspect command $COMMAND_ID in AWS Systems Manager." >&2
    exit 1
  fi
  sleep 5
done

if [[ "$STATUS" != "Success" ]]; then
  echo "Deployment failed with status: $STATUS" >&2
  AWS_PAGER='' aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query '{ResponseCode:ResponseCode,Output:StandardOutputContent,Error:StandardErrorContent}' \
    --output json >&2
  exit 1
fi

curl -fsS --connect-timeout 5 --max-time 15 --retry 20 --retry-all-errors --retry-delay 2 --retry-max-time 120 "$HEALTH_URL" >/dev/null
echo "Deployment succeeded: ${LOCAL_COMMIT:0:12}"
echo "Health check passed: $HEALTH_URL"
