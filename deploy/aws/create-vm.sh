#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?Set AWS_REGION to the fixed Region shown in AWS Settings > Project > Additional Info (for example eu-north-1)}"
INSTANCE_NAME="${INSTANCE_NAME:-workpay-test}"
INSTANCE_TYPE="${INSTANCE_TYPE:-c7i-flex.large}"
S3_BUCKET="${S3_BUCKET:?Set a globally unique S3_BUCKET name}"
ROLE_NAME="${ROLE_NAME:-workpay-test-ec2-role}"
PROFILE_NAME="${PROFILE_NAME:-workpay-test-instance-profile}"
SECURITY_GROUP_NAME="${SECURITY_GROUP_NAME:-workpay-test-web}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
if ! VPC_ID="$(aws ec2 describe-vpcs --region "$AWS_REGION" \
  --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"; then
  cat >&2 <<EOF
EC2 access failed in $AWS_REGION.

AWS's managed Free Plan permits regional resources only in the project's fixed Region.
Find it at: https://settings.aws.com > Project > Additional Info > Region
Then export that exact region and run this script again.
EOF
  exit 1
fi
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "A default VPC is required in $AWS_REGION." >&2
  exit 1
fi

FREE_TIER_ELIGIBLE="$(aws ec2 describe-instance-types --region "$AWS_REGION" \
  --instance-types "$INSTANCE_TYPE" --query 'InstanceTypes[0].FreeTierEligible' --output text)"
if [[ "$FREE_TIER_ELIGIBLE" != "True" ]]; then
  echo "$INSTANCE_TYPE is not eligible for this account's Free Tier in $AWS_REGION." >&2
  echo "Eligible instance types:" >&2
  aws ec2 describe-instance-types --region "$AWS_REGION" \
    --filters Name=free-tier-eligible,Values=true \
    --query 'InstanceTypes[].InstanceType' --output text >&2
  exit 1
fi

if ! aws s3api head-bucket --bucket "$S3_BUCKET" 2>/dev/null; then
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" \
      --create-bucket-configuration "LocationConstraint=$AWS_REGION"
  fi
fi
aws s3api put-public-access-block --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$S3_BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

TRUST_POLICY="$(mktemp)"
S3_POLICY="$(mktemp)"
trap 'rm -f "$TRUST_POLICY" "$S3_POLICY"' EXIT
cat > "$TRUST_POLICY" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF
cat > "$S3_POLICY" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::$S3_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::$S3_BUCKET/*"
    }
  ]
}
EOF

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_POLICY" >/dev/null
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name workpay-test-s3 --policy-document "file://$S3_POLICY"

if ! aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE_NAME" \
    --role-name "$ROLE_NAME"
  echo "Waiting for the new instance profile to propagate..."
  sleep 10
fi

SECURITY_GROUP_ID="$(aws ec2 describe-security-groups --region "$AWS_REGION" \
  --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text)"
if [[ -z "$SECURITY_GROUP_ID" || "$SECURITY_GROUP_ID" == "None" ]]; then
  SECURITY_GROUP_ID="$(aws ec2 create-security-group --region "$AWS_REGION" \
    --group-name "$SECURITY_GROUP_NAME" \
    --description "WorkPay HTTPS test environment" \
    --vpc-id "$VPC_ID" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --region "$AWS_REGION" \
    --group-id "$SECURITY_GROUP_ID" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTP for TLS issuance"}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTPS"}]' \
    'IpProtocol=udp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTP3"}]'
fi

EXISTING_INSTANCE_ID="$(aws ec2 describe-instances --region "$AWS_REGION" \
  --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
    Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"

if [[ -z "$EXISTING_INSTANCE_ID" || "$EXISTING_INSTANCE_ID" == "None" ]]; then
  AMI_ID="$(aws ssm get-parameter --region "$AWS_REGION" \
    --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query 'Parameter.Value' --output text)"
  INSTANCE_ID="$(aws ec2 run-instances --region "$AWS_REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --iam-instance-profile "Name=$PROFILE_NAME" \
    --security-group-ids "$SECURITY_GROUP_ID" \
    --block-device-mappings \
      'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=2 \
    --tag-specifications \
      "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME},{Key=Application,Value=WorkPay},{Key=Environment,Value=Testing}]" \
    --query 'Instances[0].InstanceId' --output text)"
  aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"
else
  INSTANCE_ID="$EXISTING_INSTANCE_ID"
fi

ALLOCATION_ID="$(aws ec2 describe-addresses --region "$AWS_REGION" \
  --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
  --query 'Addresses[0].AllocationId' --output text)"
if [[ -z "$ALLOCATION_ID" || "$ALLOCATION_ID" == "None" ]]; then
  ALLOCATION_ID="$(aws ec2 allocate-address --region "$AWS_REGION" --domain vpc \
    --query AllocationId --output text)"
  aws ec2 create-tags --region "$AWS_REGION" --resources "$ALLOCATION_ID" \
    --tags "Key=Name,Value=$INSTANCE_NAME"
fi

ASSOCIATED_INSTANCE="$(aws ec2 describe-addresses --region "$AWS_REGION" \
  --allocation-ids "$ALLOCATION_ID" --query 'Addresses[0].InstanceId' --output text)"
if [[ "$ASSOCIATED_INSTANCE" != "$INSTANCE_ID" ]]; then
  aws ec2 associate-address --region "$AWS_REGION" \
    --instance-id "$INSTANCE_ID" --allocation-id "$ALLOCATION_ID" --allow-reassociation \
    >/dev/null
fi
PUBLIC_IP="$(aws ec2 describe-addresses --region "$AWS_REGION" \
  --allocation-ids "$ALLOCATION_ID" --query 'Addresses[0].PublicIp' --output text)"

cat <<EOF
WorkPay AWS resources are ready.

Account:     $ACCOUNT_ID
Region:      $AWS_REGION
Instance:    $INSTANCE_ID
Elastic IP:  $PUBLIC_IP
S3 bucket:   $S3_BUCKET

Create an A record for your test subdomain pointing to $PUBLIC_IP.
Connect without opening SSH:

  aws ssm start-session --region $AWS_REGION --target $INSTANCE_ID
EOF
