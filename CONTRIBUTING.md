# Contributing

## Prerequisites

1. **Node.js 20+**
2. **Jira personal access token** from https://issues.redhat.com
3. **Google Cloud ADC** (for LLM classification):
   ```bash
   gcloud auth application-default login
   ```
4. **AWS access** (for S3 data operations):
   ```bash
   rh-aws-saml-login iaps-rhods-odh-dev/585132637328-rhoai-dev -- <command>
   ```

## Setup

```bash
git clone git@github.com:accorvin/bug-classification-tracker.git
cd bug-classification-tracker
npm install
cp .env.example .env
# Edit .env and add your JIRA_TOKEN
```

## Development

```bash
# Start frontend + backend dev servers
npm run dev:full

# Run tests
npm test

# Lint
npm run lint

# Format code
npm run format
```

The app runs at http://localhost:5173. The Express dev server runs on port 3001 and is proxied by Vite.

## Working with data

The classified bug data lives in S3 (`acorvin-bug-classification-data` bucket). For local development, pull the latest data:

```bash
rh-aws-saml-login iaps-rhods-odh-dev/585132637328-rhoai-dev -- \
  aws s3 cp s3://acorvin-bug-classification-data/RHOAIENG/classified-bugs.json data/RHOAIENG/classified-bugs.json

rh-aws-saml-login iaps-rhods-odh-dev/585132637328-rhoai-dev -- \
  aws s3 cp s3://acorvin-bug-classification-data/RHOAIENG/bug-summary.json data/RHOAIENG/bug-summary.json
```

If `BUG_DATA_S3_BUCKET` is **not** set in your `.env`, the dev server reads from the local `data/` directory.

## Pull requests

- Branch off `main`, open a PR back to `main`
- CI runs lint, formatting check, and tests — all must pass
- Fill out the PR template
- Keep changes focused — one feature or fix per PR

## Project structure

- `src/` — Vue 3 frontend (components, composables, services)
- `server/` — Express dev server + storage abstraction
- `amplify/backend/function/bugClassifier/src/shared/` — classification pipeline, Jira client, LLM classifier
- `lambda/` — AWS Lambda handler for deployed API
- `scripts/` — refresh and deploy scripts
