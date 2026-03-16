# Bug Classification Tracker

## Project overview

Internal Red Hat web app that pulls bugs from Jira, classifies them (rules first, LLM fallback), and presents a dashboard. Read-only Jira integration — no write-back.

## Tech stack

- **Frontend**: Vue 3 (Composition API) + Vite + Tailwind CSS
- **Backend**: Express.js (dev), AWS Lambda + API Gateway (deployed)
- **Storage**: Local JSON files (dev) or S3 (deployed), controlled by `BUG_DATA_S3_BUCKET` env var
- **Auth**: Firebase Google sign-in (@redhat.com domain)
- **LLM**: Claude Haiku 3.5 on Vertex AI via Google Cloud ADC
- **Tests**: Vitest + Vue Test Utils

## Key paths

- `src/` — Vue frontend
- `server/dev-server.js` — Express dev server
- `server/storage.js` — storage abstraction (local files or S3)
- `amplify/backend/function/bugClassifier/src/shared/` — core business logic (classification, Jira client, LLM)
- `lambda/` — Lambda handler for deployed API
- `scripts/refresh-and-push.js` — standalone data refresh script

## Commands

- `npm run dev:full` — start frontend + backend
- `npm test` — run tests
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier

## Architecture notes

- Classification is two-tier: rule-based first (labels, components, keywords), LLM only if rules don't match
- Classified bugs are cached — only re-classified when Jira `updated` timestamp is newer than `classifiedAt`
- In deployed mode, Lambda is read-only (serves pre-classified data from S3). The `npm run refresh` script handles classification and S3 upload separately.
- Dev server has a `/api/refresh` SSE endpoint that runs classification inline; this is disabled in S3 mode

## Conventions

- ESM throughout (`"type": "module"` in package.json)
- No TypeScript — plain JavaScript
- Vue Composition API with `<script setup>`
- Tailwind for styling
- Tests use Vitest globals (`describe`, `it`, `expect` without imports)

## Environment variables

See `.env.example` for the full list. Key ones:

- `JIRA_TOKEN` — required for data refresh
- `BUG_DATA_S3_BUCKET` — when set, switches storage from local files to S3
- `VITE_FIREBASE_*` — Firebase auth config
