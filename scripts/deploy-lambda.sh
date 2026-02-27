#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="${1:-bug-tracker-api}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAMBDA_DIR="$PROJECT_DIR/lambda"
ZIP_FILE="$PROJECT_DIR/lambda-deploy.zip"

echo "Installing lambda dependencies..."
cd "$LAMBDA_DIR"
npm ci --omit=dev

echo "Creating deployment zip..."
cd "$LAMBDA_DIR"
rm -f "$ZIP_FILE"
zip -rq "$ZIP_FILE" . -x "package-lock.json"

echo "Updating Lambda function code..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP_FILE" \
  --output text --query 'FunctionArn'

echo "Done."
