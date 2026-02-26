# Bug Classification Tracker — MVP Spec

## Overview
Internal Red Hat web app for tracking and classifying bugs across AI Engineering orgs. Pulls bug data from Jira (read-only), classifies bugs into categories using a tiered approach (rules first, LLM fallback), caches results, and presents a dashboard.

## Stack (must follow exactly)
- **Frontend:** Vue 3 (Composition API) + Vite + Tailwind CSS
- **Auth:** Firebase Google sign-in, restricted to @redhat.com domain
- **Backend:** Express.js (for local dev server; will become AWS Lambda later)
- **Storage:** Local JSON files via `server/storage.js` (mirrors S3 pattern)
- **Testing:** Vitest with jsdom environment

## Reference Apps
Study these repos for conventions (already cloned):
- `/tmp/jira-tracker` — kanban-style Jira feature tracker
- `/tmp/40-40-20-tracker` — sprint allocation tracker

Copy the same project structure, patterns, and conventions from these apps.

## Key Constraints
1. **NEVER write to Jira** — read-only. All classification data stored locally in S3/JSON.
2. **Minimize LLM calls** — use rule-based classification first, LLM only for unclassifiable bugs.
3. **Cache everything** — once a bug is classified, don't reclassify unless the bug was updated in Jira (compare `updated` timestamp).
4. **Explain classifications** — every bug must have a `classificationMethod` (rule/llm) and `classificationReason` (human-readable explanation).

## Bug Classification Categories
- `regression` — bug that broke previously working functionality
- `usability` — UI/UX issues, confusing workflows, accessibility
- `general-engineering` — logic errors, crashes, performance, missing validation
- `uncategorized` — fallback when neither rules nor LLM can classify

## Classification Pipeline (in `shared/classification.js`)

### Tier 1: Rule-based (no LLM cost)
Check these in order, first match wins:
- Jira labels containing "regression" or "Regression" → `regression`
- Summary/description containing "regression" (case-insensitive) → `regression`
- Jira labels containing "usability", "UX", "UI", "accessibility" → `usability`
- Component names containing "UI", "UX", "Dashboard", "Console", "Frontend" → `usability`
- Summary containing "usability", "UX", "UI issue", "confusing", "accessibility" → `usability`
- Everything else that can't be matched → goes to Tier 2

Classification reason for rules: e.g., "Label 'Regression' matched rule" or "Summary contains 'regression'"

### Tier 2: LLM Classification (Anthropic Claude on Vertex AI)
- Only called for bugs that Tier 1 couldn't classify
- Use Claude Haiku 3.5 on Vertex AI for speed/cost
- Prompt: send bug summary + description (truncated to 2000 chars), ask for category + one-line explanation
- Auth: use Application Default Credentials (gcloud ADC) — for local dev only
- Model: `claude-3-5-haiku@20241022` via Vertex AI Anthropic endpoint
- Region: `us-east5`
- GCP Project: `itpc-gcp-ai-eng-claude`
- Store the LLM's reasoning as `classificationReason`

## Data Model

### Bug (cached in S3/JSON as `data/{projectKey}/classified-bugs.json`)
```json
{
  "key": "RHOAIENG-12345",
  "summary": "Dashboard crashes on filter apply",
  "description": "When applying...",
  "status": "New",
  "priority": "Major",
  "severity": "...",
  "component": "Dashboard",
  "labels": ["bug"],
  "assignee": "jsmith",
  "reporter": "jdoe",
  "created": "2026-01-15T...",
  "updated": "2026-02-10T...",
  "resolution": null,
  "fixVersions": ["3.4"],
  "team": "AI Pipelines",
  "classification": "usability",
  "classificationMethod": "rule",
  "classificationReason": "Component 'Dashboard' matched usability rule",
  "classifiedAt": "2026-02-26T..."
}
```

### Summary (cached as `data/{projectKey}/bug-summary.json`)
```json
{
  "lastUpdated": "2026-02-26T...",
  "totalBugs": 150,
  "byClassification": {
    "regression": { "count": 25, "bySeverity": {...}, "byTeam": {...} },
    "usability": { "count": 40, "bySeverity": {...}, "byTeam": {...} },
    "general-engineering": { "count": 70, "bySeverity": {...}, "byTeam": {...} },
    "uncategorized": { "count": 15, "bySeverity": {...}, "byTeam": {...} }
  },
  "byPriority": {...},
  "byTeam": {...}
}
```

## Backend Endpoints

### `POST /api/refresh` (auth required)
- Fetch bugs from Jira (type = Bug, project = RHOAIENG initially)
- For each bug: check if already classified and not updated → skip
- Classify new/updated bugs through the pipeline
- Save results to storage
- Return summary

### `GET /api/bugs` (auth required)
- Query params: `classification`, `priority`, `team`, `dateFrom`, `dateTo`
- Returns filtered list of classified bugs

### `GET /api/summary` (auth required)
- Returns aggregate summary data for dashboard

### `GET /api/bugs/:key` (auth required)
- Returns single bug with full classification detail

## Jira Integration (`shared/jira-client.js`)
- Base URL: `https://issues.redhat.com`
- Auth: Personal Access Token (env var `JIRA_TOKEN` for dev, SSM for Lambda)
- Use Jira REST API v2: `/rest/api/2/search`
- JQL: `project = RHOAIENG AND type = Bug ORDER BY updated DESC`
- Fields to fetch: summary, description, status, priority, components, labels, assignee, reporter, created, updated, resolution, fixVersions, customfield_XXXXX (for team/scrum team if available)
- Paginate through results (maxResults=100 per page)

## Frontend Components

### `App.vue`
- Red Hat branded header (like reference apps)
- Title: "AI Engineering Bug Classifier"
- Navigation: Dashboard | Bug List
- Refresh button, last updated timestamp, user avatar

### `DashboardView.vue`
- Summary cards: Total bugs, by classification (with counts + percentages)
- Bar chart or allocation bar (similar to 40-40-20) showing classification distribution
- Breakdown by priority
- Breakdown by team
- Time trend (bugs opened per week/month, stacked by classification)

### `BugListView.vue`
- Filterable table of all classified bugs
- Columns: Key (link to Jira), Summary, Priority, Classification, Reason, Team, Created, Status
- Classification shown as colored badge
- Filter bar: classification, priority, team, date range
- Click row to expand full detail including classification explanation

### `ClassificationBadge.vue`
- Color-coded badge showing classification
- Tooltip or inline text showing the reason
- Icon indicating method (🤖 for LLM, 📏 for rule)

### `FilterBar.vue`
- Multi-select dropdowns for classification, priority, team
- Date range picker

## Dev Server (`server/dev-server.js`)
- Express app combining all endpoints
- Uses `server/storage.js` for local file JSON storage (same pattern as reference apps)
- Skips Firebase auth verification in local dev
- Env vars: `JIRA_TOKEN`, `JIRA_HOST` (default: https://issues.redhat.com)
- For LLM: uses gcloud ADC (already configured on dev machine)
- Port 3001, Vite proxies `/api` to it

## File Structure
```
bug-tracker/
├── index.html
├── package.json
├── vite.config.js
├── vitest.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example          # JIRA_TOKEN=your-token
├── server/
│   ├── dev-server.js
│   └── storage.js
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── style.css
│   ├── config/
│   │   └── firebase.js
│   ├── composables/
│   │   └── useAuth.js
│   ├── components/
│   │   ├── AuthGuard.vue
│   │   ├── DashboardView.vue
│   │   ├── BugListView.vue
│   │   ├── ClassificationBadge.vue
│   │   ├── FilterBar.vue
│   │   ├── LoadingOverlay.vue
│   │   └── Toast.vue
│   ├── services/
│   │   └── api.js
│   └── __tests__/
│       └── ... (test files for each component + shared logic)
├── amplify/               # placeholder for later
│   └── backend/
│       └── function/
│           └── bugClassifier/
│               └── src/
│                   └── shared/
│                       ├── classification.js
│                       ├── jira-client.js
│                       ├── llm-classifier.js
│                       └── __tests__/
│                           ├── classification.spec.js
│                           └── jira-client.spec.js
└── data/                  # local dev storage (gitignored)
```

## Testing Requirements
- Unit tests for all shared business logic (classification rules, summary building)
- Unit tests for Vue components (mount, render, interaction)
- Mock LLM calls in tests (never make real API calls in tests)
- Tests should pass with `npm test`

## Important Notes
- Study the reference apps carefully before writing code. Match their style, patterns, and conventions exactly.
- The AuthGuard, useAuth, firebase config, LoadingOverlay, and Toast components can be adapted directly from the reference apps.
- Use the same Tailwind primary color palette as the reference apps.
- The dev server pattern (Express + local file storage + shared business logic) must match the reference apps exactly.
- Do NOT set up Amplify infra — just create the shared/ directory structure so code can be moved to Lambda later.
