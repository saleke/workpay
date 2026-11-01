#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
GCP_REGION="${GCP_REGION:-us-central1}"
GCP_ZONE="${GCP_ZONE:-${GCP_REGION}-a}"
INSTANCE_NAME="${INSTANCE_NAME:-workpay-test}"
ADDRESS_NAME="${ADDRESS_NAME:-workpay-test-ip}"

gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable compute.googleapis.com

if ! gcloud compute addresses describe "$ADDRESS_NAME" --region "$GCP_REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$ADDRESS_NAME" --region "$GCP_REGION"
fi
STATIC_IP="$(gcloud compute addresses describe "$ADDRESS_NAME" \
  --region "$GCP_REGION" --format='value(address)')"

if ! gcloud compute firewall-rules describe workpay-https >/dev/null 2>&1; then
  gcloud compute firewall-rules create workpay-https \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:80,tcp:443,udp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=workpay-web
fi

if ! gcloud compute firewall-rules describe workpay-iap-ssh >/dev/null 2>&1; then
  gcloud compute firewall-rules create workpay-iap-ssh \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 \
    --target-tags=workpay-web
fi

if ! gcloud compute instances describe "$INSTANCE_NAME" --zone "$GCP_ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$INSTANCE_NAME" \
    --zone "$GCP_ZONE" \
    --machine-type=e2-medium \
    --address="$STATIC_IP" \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-balanced \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --metadata=enable-oslogin=TRUE \
    --tags=workpay-web \
    --labels=application=workpay,environment=testing
fi

cat <<EOF
WorkPay VM is ready.

Static IP: $STATIC_IP
Instance:  $INSTANCE_NAME
Zone:      $GCP_ZONE

Create an A record for your test subdomain pointing to $STATIC_IP.
Then connect through IAP:

  gcloud compute ssh $INSTANCE_NAME --zone $GCP_ZONE --tunnel-through-iap
EOF
