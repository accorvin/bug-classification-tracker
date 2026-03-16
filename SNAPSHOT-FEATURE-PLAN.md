# Monthly Release Snapshots — Implementation Plan

## Overview

Add the ability to capture, store, and compare monthly snapshots of bug data grouped by RHOAI release, enabling leadership to track progress across releases over time.

---

## Data Analysis & Recommendations

### Current State of Version Fields

Analysis of the current 536-bug dataset reveals inconsistent version field usage:

| Metric                     | Count | %     |
| -------------------------- | ----- | ----- |
| Has `affectsVersions` only | 187   | 34.9% |
| Has both fields            | 25    | 4.7%  |
| Has `fixVersions` only     | 7     | 1.3%  |
| Neither field populated    | 317   | 59.1% |

**Key finding:** `affectsVersions` is the primary field used for open bugs (39.6% populated vs. 5.97% for `fixVersions`). Bugs in Review/Testing states are more likely to have `fixVersions` set, confirming the user's hypothesis that `affectsVersions` tracks what's broken and `fixVersions` tracks where the fix lands.

### Recommendation: Version Resolution Strategy

Use a **merged version resolution** approach for snapshot grouping:

1. **Primary:** Use `affectsVersions` for the release a bug belongs to
2. **Fallback:** If `affectsVersions` is empty but `fixVersions` is set, use `fixVersions`
3. **Unversioned:** Bugs with neither field populated are grouped as "Unversioned"

This captures the most bugs possible (40.9% vs. 39.6% with `affectsVersions` alone).

**Multi-version handling:** A bug may list multiple `affectsVersions` (e.g., `["rhoai-3.3", "rhoai-3.4"]`). Such bugs are counted in **every** release group they belong to. This means per-release `totalBugs` values will **not** sum to `global.totalBugs`. The UI must surface this clearly (e.g., "Bugs may appear in multiple releases").

**Improvement recommendation for the team:** Encourage setting `affectsVersions` on all bugs at triage time. Currently 59.1% of bugs have no version info, which limits release-level reporting. Consider adding a Jira automation or triage checklist item. This could be surfaced in the UI as a "data quality" metric on the snapshot view.

### Version Rollup Rules

Observed version formats in the data:

- `rhoai-X.Y` — standard (most common)
- `rhoai-X.Y.Z` — z-stream patches (18 bugs)
- `rhoai-X.Y.EAn` — early access pre-releases (14 bugs reference EA1, 4 reference EA2)
- `rhoai-X.Y.next` — dev/planning versions (3 bugs)
- `RHAIIS-X.Y` — alternate product prefix (2 bugs)

**Rollup logic:**

```
rhoai-3.3.1     → rhoai-3.3
rhoai-2.25.next → rhoai-2.25
rhoai-3.4.EA1   → rhoai-3.4
rhoai-3.4.EA2   → rhoai-3.4
RHAIIS-1.1      → excluded (different product, not tracked)
```

Parse pattern: `/^(rhoai-\d+\.\d+)/` extracts the x.y release. Non-`rhoai` prefixes (e.g., `RHAIIS-*`) are excluded from tracking entirely.

**EA version visibility:** When bugs with EA versions (e.g., `rhoai-3.4.EA1`) are rolled up into their parent release, the UI shows a note or sub-count (e.g., "rhoai-3.4 (includes 14 EA bugs)") so leadership can see how many issues were identified during early access. The `eaBugs` field is only present in release groups where EA versions exist (rhoai-3.4 and forward, since EA releases started with 3.4). The UI and comparison utility should treat a missing `eaBugs` field as zero.

**Tracked releases (starting from 2.16 forward):** rhoai-2.16, rhoai-2.17, ..., rhoai-2.25, rhoai-3.0, rhoai-3.1, rhoai-3.2, rhoai-3.3, rhoai-3.4, and any future versions.

**Special release groups:**

- **"Pre-2.16":** Bugs with `rhoai-*` versions older than 2.16 are grouped here with full per-bug details, providing historical context without cluttering the main release view.
- **"Unversioned":** Bugs with no `affectsVersions` or `fixVersions` are grouped here with full per-bug details, ensuring all bugs are represented in the snapshot and CSV exports.

---

## Data Model

### Snapshot Document

Stored at `{projectKey}/snapshots/{YYYY-MM}.json`:

```json
{
  "snapshotId": "2026-03",
  "snapshotDate": "2026-03-01T00:00:00Z",
  "projectKey": "RHOAIENG",
  "generatedAt": "2026-03-01T04:00:00Z",
  "totalBugs": 536,
  "versionedBugs": 219,
  "unversionedBugs": 317,
  "dataQuality": {
    "pctWithVersion": 40.9,
    "pctWithAffectsVersion": 39.6,
    "pctWithFixVersion": 6.0
  },
  "global": {
    "byClassification": {
      "regression": 97,
      "usability": 150,
      "general-engineering": 276,
      "uncategorized": 13
    },
    "byPriority": { "Critical": 45, "Major": 200, "Minor": 67, "Normal": 150, "Blocker": 10 },
    "byStatus": {
      "New": 340,
      "Backlog": 108,
      "In Progress": 32,
      "Review": 29,
      "Testing": 26,
      "Resolved": 1
    },
    "byTeam": { "AI Core Dashboard": 154, "...": "..." }
  },
  "releases": {
    "rhoai-2.16": {
      "totalBugs": 5,
      "byClassification": { "...": "..." },
      "byPriority": { "...": "..." },
      "byStatus": { "...": "..." },
      "byTeam": { "...": "..." },
      "bugKeys": ["RHOAIENG-12345", "..."],
      "bugs": [
        {
          "key": "RHOAIENG-12345",
          "classification": "regression",
          "priority": "Major",
          "status": "New",
          "team": "AI Core Dashboard",
          "summary": "Model serving fails after upgrade",
          "created": "2026-01-15T10:00:00Z",
          "updated": "2026-02-20T14:00:00Z"
        },
        "..."
      ]
    },
    "rhoai-3.0": { "...": "..." },
    "rhoai-3.4": {
      "totalBugs": 18,
      "eaBugs": 14,
      "byClassification": { "...": "..." },
      "byPriority": { "...": "..." },
      "byStatus": { "...": "..." },
      "byTeam": { "...": "..." },
      "bugKeys": ["RHOAIENG-51000", "..."],
      "bugs": ["..."]
    },
    "Pre-2.16": {
      "totalBugs": 3,
      "byClassification": { "...": "..." },
      "byPriority": { "...": "..." },
      "byStatus": { "...": "..." },
      "byTeam": { "...": "..." },
      "bugKeys": ["RHOAIENG-10050", "..."],
      "bugs": ["..."]
    },
    "Unversioned": {
      "totalBugs": 317,
      "byClassification": { "...": "..." },
      "byPriority": { "...": "..." },
      "byStatus": { "...": "..." },
      "byTeam": { "...": "..." },
      "bugKeys": ["RHOAIENG-51340", "..."],
      "bugs": ["..."]
    }
  }
}
```

**Note:** Because bugs with multiple `affectsVersions` appear in every matching release group, the sum of all `releases[*].totalBugs` may exceed `global.totalBugs`.

**Per-bug details:** Each release group stores a `bugs` array with minimal per-bug details (key, classification, priority, status, team, summary, created, updated). This makes snapshots historically self-contained — CSV exports reflect the bug state at snapshot time, not the current state. This increases snapshot size (roughly 200 bytes per bug) but keeps each snapshot under 200 KB even at 1000 bugs.

### Snapshot Comparisons (Client-Side)

Comparisons between any two snapshots are computed **client-side** rather than pre-computed on the backend. This is the right approach because:

- Snapshots are small (a few KB each) — diffing two in the browser is trivial
- It naturally supports **arbitrary month-to-month comparison** (not just consecutive months)
- It keeps the Lambda purely read-only with no shared logic dependency
- It simplifies Phase 1 (no comparison storage) and Phase 2 (no comparison endpoint)

The comparison is computed by `src/utils/snapshot-compare.js` (introduced in Phase 3) and produces the following structure in memory:

```json
{
  "from": "2026-02",
  "to": "2026-03",
  "global": {
    "totalBugsDelta": 12,
    "byClassification": {
      "regression": { "from": 85, "to": 97, "delta": 12 },
      "...": "..."
    }
  },
  "releases": {
    "rhoai-3.4": {
      "totalBugsDelta": 8,
      "newBugKeys": ["RHOAIENG-51400", "..."],
      "resolvedBugKeys": ["RHOAIENG-50200", "..."],
      "byClassification": { "...": "..." }
    }
  },
  "velocity": {
    "netChange": 12,
    "inflow": 45,
    "outflow": 33
  }
}
```

### Velocity Tracking

Velocity is derived in two stages, improving in accuracy as the system matures:

**Stage 1 (Phases 1-4): Estimated velocity from snapshot diffs**

The system currently only stores unresolved bugs (resolved bugs disappear from the dataset). Velocity is estimated by comparing two snapshots:

- **Inflow (estimated):** Bug keys present in the selected snapshot but absent from the baseline snapshot (new bugs or reopened bugs)
- **Outflow (estimated):** Bug keys present in the baseline snapshot but absent from the selected snapshot (resolved, moved, or reclassified to non-bug)
- **Net change:** `selected.totalBugs - baseline.totalBugs`

This is an approximation — a bug that disappears could be resolved, moved to another project, or reclassified. But it provides useful directional signal from day one.

**Stage 2 (Phase 5): Precise velocity with resolved bug capture**

To enable accurate velocity and time-to-resolve metrics, Phase 5 expands the Jira query to also fetch recently resolved bugs. The modified JQL:

```
project = RHOAIENG AND type = Bug AND (resolution = Unresolved OR (resolution != Unresolved AND resolved >= "-60d"))
```

This captures bugs resolved in the last 60 days alongside unresolved bugs. Each bug gains a `resolved` timestamp and `resolution` field. The snapshot builder then computes:

- **Precise inflow:** Bugs with `created` date within the snapshot period
- **Precise outflow:** Bugs with `resolved` date within the snapshot period
- **Time-to-resolve:** `resolved - created` for resolved bugs, bucketed (< 1 week, 1-2 weeks, 2-4 weeks, 1-3 months, 3+ months)
- **Resolution rate:** Outflow / inflow ratio

Resolved bugs are stored in the snapshot but flagged with `"isResolved": true` so they don't inflate the "open bugs" count. The snapshot document gains a new top-level section:

```json
{
  "velocity": {
    "openBugs": 536,
    "resolvedInPeriod": 42,
    "createdInPeriod": 54,
    "netChange": 12,
    "avgTimeToResolveDays": 23.5,
    "timeToResolveBuckets": {
      "< 1 week": 8,
      "1-2 weeks": 12,
      "2-4 weeks": 10,
      "1-3 months": 9,
      "3+ months": 3
    }
  }
}
```

---

## Incremental Build Phases

### Phase 1: Snapshot Capture & Storage

**Goal:** Capture snapshots during refresh and store them alongside existing data.

**Backend changes:**

- `shared/snapshot.js` — New module:
  - `buildSnapshot(classifiedBugs, projectKey, snapshotId)` — builds the snapshot document from classified bugs, including "Pre-2.16" and "Unversioned" release groups
  - `resolveVersions(bug)` — implements the merged version resolution strategy, returns an array of resolved release names. Excludes non-`rhoai` prefixes (e.g., RHAIIS). Returns `["Unversioned"]` if no valid versions found.
  - `rollupVersion(versionString)` — strips z-stream/EA/next suffixes to x.y. Groups versions before 2.16 as "Pre-2.16". Tracks EA source versions for sub-count display.
  - `isEaVersion(versionString)` — returns `true` for versions matching `rhoai-X.Y.EAn` pattern (used to compute `eaBugs` count per release group)
- `scripts/refresh-and-push.js` — After step 5 (upload classified bugs + summary), add step 6: build and upload snapshot for current month, and update the snapshot index
- `server/storage.js` — No changes needed (generic read/write already supports arbitrary keys)

**Storage keys:**

- `{projectKey}/snapshots/{YYYY-MM}.json` — individual monthly snapshot
- `{projectKey}/snapshots/index.json` — list of available snapshots (see schema below)

**Snapshot index schema** (`snapshots/index.json`):

```json
{
  "snapshots": [
    { "id": "2026-03", "generatedAt": "2026-03-01T04:00:00Z", "totalBugs": 536 },
    { "id": "2026-02", "generatedAt": "2026-02-01T04:00:00Z", "totalBugs": 524 }
  ]
}
```

The index is updated during snapshot creation: read existing index, append new entry, write back. The snapshot build step maintains this file. Note: S3 does not provide atomic read-modify-write, but since snapshots run on a fixed monthly schedule, concurrent writes are not a practical concern.

**Files to create:**

- `amplify/backend/function/bugClassifier/src/shared/snapshot.js`

**Files to modify:**

- `scripts/refresh-and-push.js`

**Estimated scope:** ~150 lines of new code

---

### Phase 2: Snapshot API & Basic UI

**Goal:** Serve snapshot data via API and render a basic Snapshots tab.

**API endpoints (add to dev-server.js and lambda/index.mjs):**

| Endpoint                 | Method | Description                                     |
| ------------------------ | ------ | ----------------------------------------------- |
| `GET /api/snapshots`     | GET    | List available snapshots (read from index.json) |
| `GET /api/snapshots/:id` | GET    | Get a single snapshot (e.g., `2026-03`)         |

**Input validation (security):** The `:id` parameter is used to construct a storage key. To prevent path traversal, it **must** be validated against the pattern `/^\d{4}-\d{2}$/` before use. Reject requests with a 400 status if validation fails.

**Note on Lambda compatibility:** Both endpoints are read-only (fetching pre-computed JSON from S3), so no shared snapshot logic is needed in the Lambda. Comparisons are computed client-side (see Phase 3).

**Frontend changes:**

- `src/components/SnapshotView.vue` — New top-level view component (third tab)
  - Snapshot selector (dropdown of available months)
  - Global summary cards (total bugs, versioned %, classification breakdown)
  - Per-release collapsible sections showing classification/priority/status/team breakdowns
  - Note on multi-version counting: "Bugs affecting multiple releases are counted in each. Per-release totals may exceed the global total."
  - Data quality indicator ("59% of bugs have no version set")
- `src/App.vue` — Add "Snapshots" tab to navigation

**Authentication:** These endpoints follow the existing pattern — no server-side token validation. Auth is enforced client-side via Firebase. A future improvement (orthogonal to this feature) should add a Lambda authorizer or Express middleware that validates Firebase ID tokens server-side.

**Estimated scope:** ~300 lines new frontend, ~50 lines new API

---

### Phase 3: Comparisons & Velocity Charts

**Goal:** Enable arbitrary month-to-month comparison and trend visualization.

**Client-side comparison logic:**

- `src/utils/snapshot-compare.js` — New utility module:
  - `compareSnapshots(snapshotA, snapshotB)` — computes deltas between any two snapshots
    - Diffs global counts (totalBugs, byClassification, byPriority, byStatus, byTeam)
    - Diffs per-release counts
    - Computes inflow/outflow by diffing `bugKeys` arrays per release
    - Returns the comparison structure documented in the Data Model section
  - Works entirely in the browser — no backend endpoint needed
  - Supports arbitrary month pairs (not just consecutive), enabling comparisons like "January vs. March"

**Frontend changes:**

- `src/components/SnapshotCompare.vue` — Comparison sub-view:
  - Two-month selector (from/to dropdowns populated from snapshot index — any combination allowed)
  - Fetches both snapshots via `GET /api/snapshots/:id`, computes comparison client-side
  - Delta cards: "+12 bugs", "-5 regressions", etc. with color coding (green for decrease, red for increase)
  - Per-release delta table with inflow/outflow bug counts
- `src/components/SnapshotTrends.vue` — Trend charts:
  - Line chart: total bugs over time (per release)
  - Stacked bar chart: classification breakdown per month
  - Velocity chart: inflow vs. outflow per month (grouped bar, computed by comparing consecutive snapshots)
  - Net change sparkline per release
- Update `SnapshotView.vue` to include sub-navigation: "Current Snapshot" | "Compare" | "Trends"

**Trends data:** The trends view loads all snapshots (from the index) and assembles the time-series client-side. All snapshot fetches should be fired in parallel (`Promise.all`) to avoid sequential waterfall requests. Velocity for trends is computed by comparing each consecutive pair of snapshots using the same `compareSnapshots` utility.

**Libraries:** Uses existing `chart.js` + `vue-chartjs` (already in dependencies).

**Estimated scope:** ~150 lines comparison utility, ~450 lines new frontend components

---

### Phase 4: CSV Export

**Goal:** Enable data export for offline sharing.

**Export options:**

- **Snapshot CSV:** One row per bug-release pair, with columns: Key, Summary, Classification, Priority, Status, Team, Affected Release, Created, Updated. A bug affecting multiple releases appears in multiple rows (once per release), making cross-release impact visible and enabling easy filtering by release in Excel. Data is sourced from the per-bug details stored in each release group, so the export reflects the bug state at snapshot time (not the current state).
- **Comparison CSV:** One row per release, with columns: Release, Metric, Previous Value, Current Value, Delta
- **Trends CSV:** One row per (month, release) pair, with columns: Month, Release, Total Bugs, Regressions, Usability, General Engineering, Uncategorized, Inflow, Outflow, Net Change

**Implementation:**

- `src/utils/csv-export.js` — CSV generation utility (client-side, no backend needed)
- Download buttons on Snapshot, Compare, and Trends views

**Estimated scope:** ~100 lines

---

### Phase 5: Resolved Bug Capture, Historical Backfill & Scheduling

**Goal:** Enable precise velocity tracking by capturing resolved bugs, populate historical snapshots, and automate monthly capture.

**Part A: Resolved bug capture**

Modify the Jira query in `jira-client.js` to also fetch recently resolved bugs. The expanded JQL:

```
project = RHOAIENG AND type = Bug AND (resolution = Unresolved OR (resolution != Unresolved AND resolved >= "-60d"))
```

Changes to `jira-client.js`:

- Accept an optional `includeResolved` parameter (default: `false` for backward compatibility)
- When enabled, use the expanded JQL above
- Add `resolutiondate` to the Jira fields list (currently only `resolution` is fetched — the name, not the timestamp)
- Map `resolutiondate` to a `resolved` timestamp in `transformJiraIssue`
- Add `isResolved` boolean flag for easy filtering

Changes to `shared/snapshot.js`:

- `buildSnapshot` gains a `velocity` section when resolved bugs are present
- Compute `createdInPeriod`, `resolvedInPeriod`, `netChange`, `avgTimeToResolveDays`, and `timeToResolveBuckets`
- Resolved bugs are included in release groups but flagged, so the UI can distinguish open vs. resolved

**Velocity stage transition in `snapshot-compare.js`:** The client-side comparison utility must handle both stages gracefully. When both snapshots have a `velocity` section (Stage 2), use the precise data directly. Otherwise, fall back to estimating inflow/outflow by diffing `bugKeys` arrays (Stage 1). The comparison output structure remains the same regardless of stage, so downstream UI code doesn't need to change.

Changes to `scripts/refresh-and-push.js`:

- Pass `includeResolved: true` when fetching bugs
- Resolved bugs skip LLM classification (use rule-based only, or inherit prior classification if cached) to control costs

**Note on classification costs:** Resolved bugs that were previously classified will have cached classifications. Newly-encountered resolved bugs use rule-based classification only (Tier 1). This avoids LLM costs for bugs that are already fixed.

**Part B: Historical backfill**

The current refresh script fetches only unresolved bugs. Historical snapshots require point-in-time data. Options:

- **Option A (recommended):** Modify the Jira query to accept an optional `asOf` date parameter. Use JQL like `project = RHOAIENG AND type = Bug AND (resolution = Unresolved OR resolved >= "YYYY-MM-DD")` to capture bugs that were open at a given point in time. Run the refresh script once per historical month.
- **Option B (simpler, less accurate):** Take the current unresolved set as the first snapshot and only compare forward.

**Input validation (security):** The `--from` and `--to` CLI arguments are interpolated into JQL queries. To prevent JQL injection, validate that both values strictly match the pattern `/^\d{4}-\d{2}$/` before use. Reject with a clear error message if validation fails.

**Backfill script:**

- `scripts/backfill-snapshots.js` — Runs the refresh + snapshot pipeline for each month from a start date to now
- Usage: `node scripts/backfill-snapshots.js --from 2025-10 --to 2026-03`
- Rebuilds `snapshots/index.json` at the end with all generated snapshots

**Part C: Scheduling**

- Add a CloudWatch Events rule (or EventBridge) to trigger the Lambda refresh + snapshot on the **1st of each month**
- Alternatively, add a cron job to run `npm run refresh` on the first of each month
- Add a `--snapshot` flag to the refresh script (or make it default behavior)
- The `generatedAt` timestamp in each snapshot records the exact capture time, so leadership knows precisely when the data was collected

**Estimated scope:** ~80 lines JQL/data model changes, ~150 lines backfill script, ~50 lines snapshot velocity logic, infrastructure config for scheduling

---

### Phase 6: PDF Export (Future)

**Goal:** Generate polished PDF reports with embedded charts.

**Approach options:**

- **Client-side:** Use `html2canvas` + `jsPDF` to render the snapshot view as a PDF. Pros: no backend changes. Cons: chart rendering can be inconsistent.
- **Server-side:** Use Puppeteer/Playwright in a Lambda to render the snapshot page headlessly. Pros: consistent output. Cons: adds a heavy dependency, increases Lambda size.
- **Hybrid (recommended):** Use `chart.js` to render charts to canvas, export as PNG, then compose into PDF with `jsPDF`. Keep it client-side.

**Deferred** — implement after Phases 1-5 are validated with leadership.

**Estimated scope:** ~300 lines

---

## File Changes Summary

### New Files

| File                                                                           | Phase | Purpose                                                |
| ------------------------------------------------------------------------------ | ----- | ------------------------------------------------------ |
| `amplify/backend/function/bugClassifier/src/shared/snapshot.js`                | 1     | Snapshot building, version resolution, rollup          |
| `amplify/backend/function/bugClassifier/src/shared/__tests__/snapshot.test.js` | 1     | Tests for snapshot logic                               |
| `src/components/SnapshotView.vue`                                              | 2     | Main snapshot tab                                      |
| `src/utils/snapshot-compare.js`                                                | 3     | Client-side comparison logic for arbitrary month pairs |
| `src/components/SnapshotCompare.vue`                                           | 3     | Comparison view                                        |
| `src/components/SnapshotTrends.vue`                                            | 3     | Trend charts                                           |
| `src/utils/csv-export.js`                                                      | 4     | CSV generation                                         |
| `scripts/backfill-snapshots.js`                                                | 5     | Historical backfill                                    |

### Modified Files

| File                                                               | Phase | Change                                                          |
| ------------------------------------------------------------------ | ----- | --------------------------------------------------------------- |
| `scripts/refresh-and-push.js`                                      | 1     | Add snapshot build step after refresh                           |
| `server/dev-server.js`                                             | 2     | Add snapshot read endpoints (2 routes)                          |
| `lambda/index.mjs`                                                 | 2     | Add snapshot read endpoints (2 routes)                          |
| `src/App.vue`                                                      | 2     | Add Snapshots tab                                               |
| `src/services/api.js`                                              | 2     | Add snapshot API functions                                      |
| `amplify/backend/function/bugClassifier/src/shared/jira-client.js` | 5     | Add resolved bug capture + optional date filtering for backfill |

---

## Architecture Decisions

### Why client-side comparisons (not pre-computed or server-side)?

Three factors drive this decision:

1. **Arbitrary month pairs:** Leadership needs to compare any two months (e.g., January vs. March), not just consecutive months. Pre-computing all O(n²) pairs doesn't scale.
2. **Lambda constraints:** The Lambda is deployed as an independent zip with no access to shared code. It can only serve static JSON from S3. Computing comparisons server-side would require duplicating logic.
3. **Small data:** Snapshots are a few KB each. Diffing two in the browser is instant.

The `src/utils/snapshot-compare.js` utility handles all comparison logic, and both the Compare and Trends views use it.

### Why store `bugKeys` in each release group?

Enables the client-side comparison utility to compute inflow/outflow (which specific bugs appeared or disappeared per release) by diffing the `bugKeys` arrays between two snapshots, without loading the full classified-bugs.json.

### Why client-side CSV export?

The data is already in the browser after loading the snapshot. No need for a server round-trip. Keeps the Lambda lightweight.

### Why defer resolved bug capture to Phase 5?

The current Jira query (`resolution = Unresolved`) excludes resolved bugs. Adding them increases dataset size and requires careful handling of classification costs (resolved bugs should skip LLM classification). Phases 1-4 use estimated velocity (snapshot diffs) which provides useful directional signal. Phase 5 adds precise velocity with resolved bug data once the core snapshot infrastructure is validated.

### Why no server-side auth on new endpoints?

The existing API endpoints (bugs, summary, config) have no server-side token validation — auth is enforced client-side via Firebase and the client sends Bearer tokens that the backend ignores. The new snapshot endpoints follow this same pattern for consistency. Adding server-side Firebase token validation (via a Lambda authorizer or Express middleware) is a worthwhile future improvement but is orthogonal to this feature and should be tracked separately.

### Multi-version bug counting

Bugs with multiple `affectsVersions` are counted in every matching release group. This means per-release totals may exceed the global total. This is intentional — it accurately reflects which releases are impacted. The alternative (assigning each bug to a single release) would hide cross-release impact. The UI surfaces this with a note explaining the counting behavior.

---

## Resolved Decisions

1. **Snapshot overwrite policy:** Overwrite. If the refresh runs multiple times in the same month, the snapshot is overwritten with the latest data. The `generatedAt` timestamp records the exact capture time so the UI can display precisely when the data was collected.

2. **RHAIIS versions:** Exclude. Bugs referencing non-`rhoai` prefixes (e.g., `RHAIIS-1.1`) are excluded from tracking entirely. They are a different product and should not appear in RHOAI release snapshots.

3. **EA versions:** Show a note or sub-count. When EA bugs are rolled up into their parent release, the release group includes an `eaBugs` count and the UI displays it (e.g., "rhoai-3.4 (includes 14 EA bugs)").

4. **Unversioned bugs:** Surface as a data quality issue. Include a "Data Quality" card on the snapshot view showing % of bugs with version info, with a trend line over time. The goal is to encourage teams to set `affectsVersions` at triage time. Unversioned bugs get their own release group with full per-bug details.
