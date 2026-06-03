#!/usr/bin/env bash
# build_and_push.sh — build Lambda container + push to ECR
# Usage (M6 [USER_RUN]):
#   bash infra/lambda/build_and_push.sh
#
# Prerequisites:
#   - AWS credentials exported (ACCOUNT_ID / REGION match Learner Lab)
#   - Docker daemon running
#   - ECR repo tdcs-dl-cleaner already exists
#     (aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1)
set -euo pipefail

ACCOUNT_ID="${ACCOUNT_ID:-654485222392}"
REGION="${REGION:-us-east-1}"
REPO="${REPO:-tdcs-dl-cleaner}"
TAG="${TAG:-latest}"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

cd "$(dirname "$0")"

echo "[1/4] esbuild — bundle src/index.ts → dist/index.js ..."
npm install
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/index.js \
  --format=cjs \
  --external:nodejs-polars \
  --external:@aws-sdk/*

echo "[2/4] docker build ..."
docker build -t "${REPO}:${TAG}" .

echo "[3/4] ECR login ..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URI}"

echo "[4/4] tag + push ..."
docker tag "${REPO}:${TAG}" "${ECR_URI}/${REPO}:${TAG}"
docker push "${ECR_URI}/${REPO}:${TAG}"

echo ""
echo "DONE: ${ECR_URI}/${REPO}:${TAG}"
echo "Update Terraform lambda_image_tag if needed, then: terraform apply"
