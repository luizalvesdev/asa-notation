#!/usr/bin/env bash
set -euo pipefail

STACK="${STACK:-asa-notation}"
REGION="${AWS_REGION:-sa-east-1}"
cd "$(dirname "$0")/.."

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

BUCKET="$(output WebBucketName)"
DISTRIBUTION="$(output DistributionId)"

npm run build -w @asa/web

aws s3 sync apps/web/dist/assets "s3://$BUCKET/assets" --delete \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync apps/web/dist "s3://$BUCKET" --delete --exclude "assets/*" \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html" "/" \
  --query "Invalidation.Id" --output text

echo "publicado em $(output AppUrl)"
