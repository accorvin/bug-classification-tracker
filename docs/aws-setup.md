# AWS Deployment Setup

Run these commands in order to set up all AWS resources. Replace placeholder
values (`<ACCOUNT_ID>`, `<REGION>`, bucket name, etc.) with your own.

## Variables

Set these once for the rest of the commands:

```bash
REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
S3_BUCKET=bug-tracker-data          # your data bucket name
S3_PREFIX=""                        # optional key prefix
FUNCTION_NAME=bug-tracker-api
API_NAME=bug-tracker-http-api
AMPLIFY_APP_NAME=bug-classification-tracker
REPO_URL=https://github.com/<owner>/bug-classification-tracker
```

---

## 1. S3 Data Bucket

Skip if you already have a bucket with classified bug data.

```bash
aws s3 mb "s3://$S3_BUCKET" --region "$REGION"
```

Seed it with data:

```bash
# Locally, with JIRA_TOKEN set:
BUG_DATA_S3_BUCKET=$S3_BUCKET npm run refresh
```

---

## 2. IAM Role for Lambda

```bash
# Create the role
aws iam create-role \
  --role-name bug-tracker-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach basic Lambda execution policy (CloudWatch Logs)
aws iam attach-role-policy \
  --role-name bug-tracker-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Inline policy for S3 read access
aws iam put-role-policy \
  --role-name bug-tracker-lambda-role \
  --policy-name s3-read-bug-data \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": \"s3:GetObject\",
      \"Resource\": \"arn:aws:s3:::${S3_BUCKET}/*\"
    }]
  }"
```

Wait ~10 seconds for the role to propagate before creating the Lambda function.

---

## 3. Lambda Function

First, build the deployment zip:

```bash
./scripts/deploy-lambda.sh $FUNCTION_NAME
# This will fail the first time since the function doesn't exist yet.
# That's fine — we just need the zip file. Create the function below:
```

Or build the zip manually:

```bash
cd lambda && npm ci --omit=dev && cd ..
zip -rj lambda-deploy.zip lambda/ -x "lambda/package-lock.json"
```

Create the function:

```bash
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/bug-tracker-lambda-role"

aws lambda create-function \
  --function-name "$FUNCTION_NAME" \
  --runtime nodejs20.x \
  --handler index.handler \
  --role "$ROLE_ARN" \
  --zip-file fileb://lambda-deploy.zip \
  --memory-size 256 \
  --timeout 30 \
  --environment "Variables={BUG_DATA_S3_BUCKET=$S3_BUCKET,BUG_DATA_S3_PREFIX=$S3_PREFIX}" \
  --region "$REGION"
```

For subsequent deploys, just run:

```bash
./scripts/deploy-lambda.sh $FUNCTION_NAME
```

---

## 4. HTTP API Gateway

```bash
# Create the HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name "$API_NAME" \
  --protocol-type HTTP \
  --query ApiId --output text)

echo "API_ID=$API_ID"

# Create Lambda integration
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id "$API_ID" \
  --integration-type AWS_PROXY \
  --integration-uri "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}" \
  --payload-format-version 2.0 \
  --query IntegrationId --output text)

# Create catch-all route for /api/*
aws apigatewayv2 create-route \
  --api-id "$API_ID" \
  --route-key 'ANY /api/{proxy+}' \
  --target "integrations/$INTEGRATION_ID"

# Create default stage with auto-deploy
aws apigatewayv2 create-stage \
  --api-id "$API_ID" \
  --stage-name '$default' \
  --auto-deploy
```

Your API Gateway URL will be: `https://$API_ID.execute-api.$REGION.amazonaws.com`

---

## 5. Lambda Resource Policy

Grant API Gateway permission to invoke the Lambda:

```bash
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*"
```

Test it:

```bash
API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"
curl "$API_URL/api/config"
curl "$API_URL/api/summary"
curl "$API_URL/api/bugs?project=RHOAIENG" | head -c 200
```

---

## 6. Amplify App

```bash
# Create Amplify app (source code from GitHub)
AMPLIFY_APP_ID=$(aws amplify create-app \
  --name "$AMPLIFY_APP_NAME" \
  --repository "$REPO_URL" \
  --access-token "<GITHUB_PERSONAL_ACCESS_TOKEN>" \
  --build-spec "$(cat <<'SPEC'
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
SPEC
)" \
  --environment-variables "{
    \"VITE_FIREBASE_API_KEY\":\"<your-firebase-api-key>\",
    \"VITE_FIREBASE_AUTH_DOMAIN\":\"<your-firebase-auth-domain>\",
    \"VITE_FIREBASE_PROJECT_ID\":\"<your-firebase-project-id>\",
    \"VITE_FIREBASE_APP_ID\":\"<your-firebase-app-id>\"
  }" \
  --query 'app.appId' --output text)

echo "AMPLIFY_APP_ID=$AMPLIFY_APP_ID"
```

---

## 7. Amplify Branch

```bash
aws amplify create-branch \
  --app-id "$AMPLIFY_APP_ID" \
  --branch-name main \
  --enable-auto-build
```

---

## 8. Amplify Rewrite Rules

These proxy `/api/*` requests server-side to API Gateway (no CORS needed)
and add an SPA fallback for client-side routing.

```bash
API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com"

aws amplify update-app \
  --app-id "$AMPLIFY_APP_ID" \
  --custom-rules "[
    {
      \"source\": \"/api/<*>\",
      \"target\": \"${API_URL}/api/<*>\",
      \"status\": \"200\"
    },
    {
      \"source\": \"</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>\",
      \"target\": \"/index.html\",
      \"status\": \"200\"
    }
  ]"
```

---

## 9. Trigger First Build

```bash
aws amplify start-job \
  --app-id "$AMPLIFY_APP_ID" \
  --branch-name main \
  --job-type RELEASE
```

---

## Post-Deploy Checklist

- [ ] Add Amplify domain (`main.<AMPLIFY_APP_ID>.amplifyapp.com`) to
      Firebase Console → Authentication → Authorized domains
- [ ] Test API directly: `curl $API_URL/api/config`
- [ ] Test full flow in browser: sign in → dashboard → bug list → bug detail
- [ ] Verify refresh button is hidden/disabled (refreshEnabled: false)
- [ ] Run `npm run refresh` locally with `BUG_DATA_S3_BUCKET` set to update data
