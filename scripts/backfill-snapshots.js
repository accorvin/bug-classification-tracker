#!/usr/bin/env node

/**
 * Historical Snapshot Backfill Script
 *
 * Generates snapshots for historical months by querying Jira for the
 * approximate point-in-time bug state at each month-end.
 *
 * Usage:
 *   node scripts/backfill-snapshots.js --from 2025-10 --to 2026-03
 *   node scripts/backfill-snapshots.js --from 2025-10 --to 2026-03 --project RHOAIENG
 *
 * Environment variables:
 *   JIRA_TOKEN - Required. Jira API token
 *   BUG_DATA_S3_BUCKET - Required. S3 bucket name
 *   BUG_DATA_S3_PREFIX - Optional. S3 key prefix (default: empty)
 */

import 'dotenv/config';
import { readFromStorage, writeToStorage } from '../server/storage.js';
import { fetchBugs } from '../amplify/backend/function/bugClassifier/src/shared/jira-client.js';
import { classifyWithRules } from '../amplify/backend/function/bugClassifier/src/shared/classification.js';
import { buildSnapshot } from '../amplify/backend/function/bugClassifier/src/shared/snapshot.js';

const SNAPSHOT_ID_PATTERN = /^\d{4}-\d{2}$/;

// Parse CLI arguments
const args = process.argv.slice(2);
const projectKey = getArg('--project') || 'RHOAIENG';
const fromMonth = getArg('--from');
const toMonth = getArg('--to');

const JIRA_TOKEN = process.env.JIRA_TOKEN;
const S3_BUCKET = process.env.BUG_DATA_S3_BUCKET;

function getArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return null;
  return args[index + 1];
}

// Validation
if (!JIRA_TOKEN) {
  console.error('ERROR: JIRA_TOKEN environment variable is not set');
  process.exit(1);
}
if (!S3_BUCKET) {
  console.log('NOTE: BUG_DATA_S3_BUCKET is not set — using local file storage');
}
if (!fromMonth || !SNAPSHOT_ID_PATTERN.test(fromMonth)) {
  console.error('ERROR: --from is required and must match YYYY-MM format (e.g., 2025-10)');
  process.exit(1);
}
if (!toMonth || !SNAPSHOT_ID_PATTERN.test(toMonth)) {
  console.error('ERROR: --to is required and must match YYYY-MM format (e.g., 2026-03)');
  process.exit(1);
}
if (fromMonth > toMonth) {
  console.error('ERROR: --from must be before or equal to --to');
  process.exit(1);
}

/**
 * Generate an array of YYYY-MM strings from fromMonth to toMonth (inclusive).
 */
function generateMonths(from, to) {
  const months = [];
  const [fromY, fromM] = from.split('-').map(Number);
  const [toY, toM] = to.split('-').map(Number);

  let y = fromY;
  let m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

/**
 * Get the last day of a month as YYYY-MM-DD.
 */
function lastDayOfMonth(snapshotId) {
  const [year, month] = snapshotId.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${snapshotId}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Classify bugs using cache + rules only (no LLM for backfill).
 */
function classifyBugsRulesOnly(bugs, cacheMap) {
  return bugs.map((bug) => {
    const existing = cacheMap.get(bug.key);
    if (existing && existing.classification) {
      return {
        ...bug,
        classification: existing.classification,
        classificationMethod: existing.classificationMethod,
        classificationReason: existing.classificationReason,
        classifiedAt: existing.classifiedAt,
      };
    }
    const ruleResult = classifyWithRules(bug);
    if (ruleResult) {
      return { ...bug, ...ruleResult, classifiedAt: new Date().toISOString() };
    }
    return {
      ...bug,
      classification: 'uncategorized',
      classificationMethod: 'rule',
      classificationReason: 'Backfill — rules only, no match',
      classifiedAt: new Date().toISOString(),
    };
  });
}

async function main() {
  const months = generateMonths(fromMonth, toMonth);

  console.log('');
  console.log('='.repeat(60));
  console.log('Snapshot Backfill');
  console.log('='.repeat(60));
  console.log(`Project:    ${projectKey}`);
  console.log(`Range:      ${fromMonth} to ${toMonth} (${months.length} months)`);
  console.log(`S3 Bucket:  ${S3_BUCKET}`);
  console.log('='.repeat(60));
  console.log('');

  // Load existing classified data for cache
  console.log('Loading classification cache...');
  const existingData = await readFromStorage(`${projectKey}/classified-bugs.json`);
  const cacheMap = new Map();
  if (existingData && existingData.bugs) {
    for (const bug of existingData.bugs) {
      cacheMap.set(bug.key, bug);
    }
    console.log(`Loaded ${cacheMap.size} cached classifications\n`);
  } else {
    console.log('No cache found\n');
  }

  const generatedSnapshots = [];

  for (let i = 0; i < months.length; i++) {
    const snapshotId = months[i];
    const asOfDate = lastDayOfMonth(snapshotId);
    console.log(
      `[${i + 1}/${months.length}] Generating snapshot ${snapshotId} (as-of ${asOfDate})...`,
    );

    try {
      const bugs = await fetchBugs(projectKey, JIRA_TOKEN, { asOfDate });
      const openBugs = bugs.filter((b) => !b.isResolved);
      const resolvedBugs = bugs.filter((b) => b.isResolved);
      console.log(`  Fetched ${openBugs.length} open + ${resolvedBugs.length} resolved bugs`);

      const classifiedBugs = classifyBugsRulesOnly(bugs, cacheMap);
      const snapshot = buildSnapshot(classifiedBugs, projectKey, snapshotId);

      await writeToStorage(`${projectKey}/snapshots/${snapshotId}.json`, snapshot);
      generatedSnapshots.push({
        id: snapshotId,
        generatedAt: snapshot.generatedAt,
        totalBugs: snapshot.totalBugs,
      });

      console.log(
        `  ${snapshot.totalBugs} open bugs, ${Object.keys(snapshot.releases).length} releases`,
      );
      if (snapshot.velocity) {
        console.log(
          `  Velocity: +${snapshot.velocity.createdInPeriod} created, -${snapshot.velocity.resolvedInPeriod} resolved`,
        );
      }
    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
    }
  }

  // Rebuild snapshot index (merge with any existing snapshots not in our range)
  console.log('\nRebuilding snapshot index...');
  const existingIndex = await readFromStorage(`${projectKey}/snapshots/index.json`);
  const existingSnapshots = (existingIndex?.snapshots || []).filter(
    (s) => s.id < fromMonth || s.id > toMonth,
  );

  const index = {
    snapshots: [...existingSnapshots, ...generatedSnapshots].sort((a, b) =>
      b.id.localeCompare(a.id),
    ),
  };

  await writeToStorage(`${projectKey}/snapshots/index.json`, index);

  console.log('');
  console.log('='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Generated: ${generatedSnapshots.length} snapshots`);
  console.log(`Index:     ${index.snapshots.length} total entries`);
  console.log('='.repeat(60));
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
