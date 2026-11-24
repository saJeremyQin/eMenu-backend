#!/usr/bin/env bash
# Creates the Terraform state bucket for one eMenu account. Run once per account,
# before the first `terraform init`. Terraform never manages this bucket.
#
#   AWS_PROFILE=emenu      ./create-state-bucket.sh dev  205930647566
#   AWS_PROFILE=emenu-prod ./create-state-bucket.sh prod 471112659065
set -euo pipefail

ENV="${1:?usage: $0 <dev|prod> <account-id>}"
ACCOUNT_ID="${2:?usage: $0 <dev|prod> <account-id>}"
REGION="ap-southeast-2"
BUCKET="emenu-tfstate-${ENV}-${ACCOUNT_ID}"

# 1. Make sure we're in the right account (guards against the wrong AWS_PROFILE).
CURRENT=$(aws sts get-caller-identity --query Account --output text)
if [ "$CURRENT" != "$ACCOUNT_ID" ]; then
  echo "Wrong account: credentials are for $CURRENT, expected $ACCOUNT_ID. Check AWS_PROFILE." >&2
  exit 1
fi

# 2. Stop if it already exists (don't touch an existing state bucket).
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket $BUCKET already exists. Nothing to do."
  exit 0
fi

echo "Creating s3://$BUCKET in $REGION ..."

# 3. Create the bucket.
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

# 4. Versioning: every state change keeps the previous version, for recovery.
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

# 5. Encryption at rest (SSE-S3).
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# 6. Never public.
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# 7. No ACLs: access is controlled by IAM and the bucket policy only.
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'

# 8. Reject any request that isn't over TLS.
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"DenyInsecureTransport\",
    \"Effect\": \"Deny\",
    \"Principal\": \"*\",
    \"Action\": \"s3:*\",
    \"Resource\": [\"arn:aws:s3:::$BUCKET\", \"arn:aws:s3:::$BUCKET/*\"],
    \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}
  }]
}"

# 9. Keep old state versions for 90 days (at least the last 20), then delete them.
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{
    "ID": "expire-old-state-versions",
    "Status": "Enabled",
    "Filter": {},
    "NoncurrentVersionExpiration": {"NoncurrentDays": 90, "NewerNoncurrentVersions": 20}
  }]
}'

# 10. Tags, matching the Terraform default tags.
aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging \
  "TagSet=[{Key=Project,Value=emenu},{Key=Environment,Value=$ENV},{Key=ManagedBy,Value=create-state-bucket.sh}]"

echo "Done: s3://$BUCKET"
