# S3 Refactor Spec — Interim Deployment Architecture

## Goal
Split the app so the LLM classification runs on a local laptop while the Amplify-deployed app reads pre-classified data from S3. This is an interim solution until a proper service account is available for LLM access from the deployed backend.

## Architecture

### Deployed App (Amplify — Express API + Vue frontend)
- **No LLM calls.** The Express API reads classified bug data from S3 instead of running classification itself.
- Storage module (`server/storage.js`) gets a new S3 backend:
  - `readFromStorage(key)` → reads from S3 bucket (env var `BUG_DATA_S3_BUCKET`)
  - `writeToStorage(key, data)` → writes to S3 bucket
  - Falls back to local file storage if `BUG_DATA_S3_BUCKET` is not set (preserves local dev workflow)
- The `/api/refresh` SSE endpoint is **removed or disabled** in the deployed version when `BUG_DATA_S3_BUCKET` is set. The refresh button in the UI should be hidden when the backend reports that refresh is disabled.
  - Add `GET /api/config` endpoint returning `{ refreshEnabled: boolean, lastUpdated: string }` so the frontend knows whether to show the refresh button.
- All read endpoints (`/api/bugs`, `/api/bugs/:key`, `/api/summary`) work exactly as before — they just read from S3 instead of local files.

### Local Refresh Script (`scripts/refresh-and-push.js`)
- Standalone Node.js script (NOT part of the Express server)
- Does everything the current `/api/refresh` handler does:
  1. Fetch bugs from Jira (`jira-client.js`)
  2. Load existing classified data from S3 (for caching)
  3. Classify new/updated bugs (rules + LLM via `classification.js`)
  4. Build summary (`buildSummary()`)
  5. Upload `classified-bugs.json` and `bug-summary.json` to S3
- Uses the same shared modules from `amplify/backend/function/bugClassifier/src/shared/`
- Env vars needed: `JIRA_TOKEN`, `BUG_DATA_S3_BUCKET`, `BUG_DATA_S3_PREFIX` (default: empty, so files go to `RHOAIENG/classified-bugs.json` etc.)
- AWS credentials: uses default AWS credential chain (env vars, ~/.aws/credentials, etc.)
- Add `npm run refresh` script to package.json

### S3 Details
- Bucket name from env var: `BUG_DATA_S3_BUCKET`
- Key pattern: `{prefix}{projectKey}/classified-bugs.json` and `{prefix}{projectKey}/bug-summary.json`
- Prefix from env var: `BUG_DATA_S3_PREFIX` (default: empty string)
- The deployed Express API and the local refresh script both use the same bucket/prefix.

## Changes Required

### 1. `server/storage.js` — Add S3 Backend
- Add `@aws-sdk/client-s3` dependency
- If `BUG_DATA_S3_BUCKET` env var is set:
  - `readFromStorage(key)` → `GetObjectCommand` from S3
  - `writeToStorage(key, data)` → `PutObjectCommand` to S3
- If NOT set: keep existing local file behavior (for local dev without S3)
- Both functions become async (they already are in the callers)

### 2. `server/dev-server.js` — Conditional Refresh
- Add `GET /api/config` endpoint:
  ```json
  { "refreshEnabled": true/false, "lastUpdated": "..." }
  ```
  `refreshEnabled` is `false` when `BUG_DATA_S3_BUCKET` is set (deployed mode)
- The `/api/refresh` endpoint should return 403 with message "Refresh disabled — use the local refresh script" when `BUG_DATA_S3_BUCKET` is set.
- Update `readFromStorage`/`writeToStorage` calls to `await` since they're now async.

### 3. `scripts/refresh-and-push.js` — New File
- Import shared modules from `../amplify/backend/function/bugClassifier/src/shared/`
- Import `readFromStorage`/`writeToStorage` from `../server/storage.js`
- Set `BUG_DATA_S3_BUCKET` from env
- Accept CLI args: `--project` (default RHOAIENG), `--hard` (force reclassify all), `--concurrency` (default 20)
- Console output with progress (not SSE — this is a CLI tool)
- Exit 0 on success, 1 on failure

### 4. `src/services/api.js` — Frontend Changes
- Add `getConfig()` function calling `GET /api/config`
- Export it for use in App.vue

### 5. `src/App.vue` — Conditional Refresh Button
- On mount, call `getConfig()`
- If `refreshEnabled` is false, hide the refresh button
- Show "Data refreshed externally" or similar indicator with `lastUpdated`

### 6. `package.json`
- Add `@aws-sdk/client-s3` to dependencies
- Add script: `"refresh": "node scripts/refresh-and-push.js"`

### 7. `.env.example` — Update
- Add `BUG_DATA_S3_BUCKET=` and `BUG_DATA_S3_PREFIX=` entries

## What NOT to Change
- The Vue frontend components (DashboardView, BugListView, etc.) — they consume the same API shape
- The classification pipeline (`classification.js`, `llm-classifier.js`) — shared between both paths
- The Jira client (`jira-client.js`) — shared
- Firebase auth — stays in place
- The data model — identical JSON shape whether from local files or S3

## Local Dev Workflow (unchanged)
When `BUG_DATA_S3_BUCKET` is NOT set:
- `npm run dev:full` runs Vite + Express dev server
- Refresh button works, classification runs locally
- Data stored in `server/data/` as before

## Deployed Workflow (new)
1. Deploy to Amplify as usual (Vue + Express)
2. Set `BUG_DATA_S3_BUCKET` env var in Amplify
3. On laptop: `npm run refresh` (or cron it)
4. App reads from S3, users see classified bugs
