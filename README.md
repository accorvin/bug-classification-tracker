# Bug Classification Tracker MVP

Internal Red Hat web app for tracking and classifying bugs across AI Engineering orgs. Pulls bug data from Jira (read-only), classifies bugs into categories using a tiered approach (rules first, LLM fallback), caches results, and presents a dashboard.

## Tech Stack

- **Frontend:** Vue 3 (Composition API) + Vite + Tailwind CSS
- **Auth:** Firebase Google sign-in, restricted to @redhat.com domain
- **Backend:** Express.js (local dev server; will become AWS Lambda later)
- **Storage:** Local JSON files via `server/storage.js` (mirrors S3 pattern)
- **Testing:** Vitest with jsdom environment
- **LLM:** Claude Haiku 3.5 on Vertex AI (via Application Default Credentials)

## Quick Start

### Prerequisites

1. Node.js 18+ installed
2. A Jira personal access token from https://issues.redhat.com
3. Google Cloud ADC configured (for LLM classification):
   ```bash
   gcloud auth application-default login
   ```

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your JIRA_TOKEN
```

### Development

```bash
# Start both the Vite dev server and Express API server
npm run dev:full

# Or run them separately:
npm run dev        # Vite dev server (port 5173)
npm run dev:server # Express API server (port 3001)
```

Then open http://localhost:5173 in your browser.

### Testing

```bash
# Run all tests
npm test

# Watch mode for development
npm test:watch
```

## Project Structure

```
bug-tracker/
├── src/                          # Frontend Vue app
│   ├── components/               # Vue components
│   │   ├── AuthGuard.vue        # Authentication wrapper
│   │   ├── DashboardView.vue    # Summary dashboard
│   │   ├── BugListView.vue      # Filterable bug table
│   │   ├── ClassificationBadge.vue
│   │   ├── FilterBar.vue
│   │   ├── LoadingOverlay.vue
│   │   └── Toast.vue
│   ├── composables/              # Vue composables
│   │   └── useAuth.js           # Firebase auth
│   ├── config/
│   │   └── firebase.js          # Firebase config
│   ├── services/
│   │   └── api.js               # Backend API client
│   ├── __tests__/               # Frontend tests
│   ├── App.vue                  # Root component
│   ├── main.js                  # App entry point
│   └── style.css                # Tailwind imports
├── server/                       # Local dev backend
│   ├── dev-server.js            # Express server
│   └── storage.js               # Local JSON file storage
├── amplify/backend/function/bugClassifier/src/shared/
│   ├── classification.js        # Classification pipeline (Tier 1: rules, Tier 2: LLM)
│   ├── jira-client.js          # Jira API client (read-only)
│   ├── llm-classifier.js       # LLM classification via Vertex AI
│   └── __tests__/              # Shared logic tests
├── data/                        # Local storage (gitignored)
│   └── RHOAIENG/
│       ├── classified-bugs.json
│       └── bug-summary.json
└── public/
    └── redhat-logo.svg
```

## How It Works

### Classification Pipeline

1. **Tier 1: Rule-based** (no LLM cost)
   - Checks labels for "regression", "usability", "UX", "UI", "accessibility"
   - Checks component names for UI/UX keywords
   - Checks summary/description for regression keywords
   - First match wins

2. **Tier 2: LLM** (Claude Haiku on Vertex AI)
   - Only called if Tier 1 doesn't match
   - Sends bug summary + description (truncated to 2000 chars)
   - Returns classification + reason

3. **Caching**
   - Once classified, bugs are cached in `data/{projectKey}/classified-bugs.json`
   - Only re-classified if the bug's `updated` timestamp is newer than `classifiedAt`

### Bug Categories

- `regression` — bug that broke previously working functionality
- `usability` — UI/UX issues, confusing workflows, accessibility
- `general-engineering` — logic errors, crashes, performance, missing validation
- `uncategorized` — fallback when neither rules nor LLM can classify

## API Endpoints

### `POST /api/refresh`
- Fetch bugs from Jira (project = RHOAIENG)
- Classify new/updated bugs through the pipeline
- Save results to local storage
- Return summary

### `GET /api/bugs`
- Query params: `classification`, `priority`, `team`, `dateFrom`, `dateTo`
- Returns filtered list of classified bugs

### `GET /api/summary`
- Returns aggregate summary data for dashboard

### `GET /api/bugs/:key`
- Returns single bug with full classification detail

## Next Steps (Post-MVP)

- [ ] Deploy to AWS Lambda + API Gateway
- [ ] Replace local JSON storage with S3
- [ ] Add more Jira projects beyond RHOAIENG
- [ ] Enhance LLM prompts for better classification accuracy
- [ ] Add time-series trend charts
- [ ] Export functionality (CSV, PDF)
