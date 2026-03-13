#!/usr/bin/env node

/**
 * Standalone refresh script for classified bug data
 *
 * This script:
 * 1. Fetches bugs from Jira
 * 2. Loads existing classified data from S3 (for caching)
 * 3. Classifies new/updated bugs (rules + LLM)
 * 4. Builds summary
 * 5. Uploads classified-bugs.json and bug-summary.json to S3
 *
 * Usage:
 *   npm run refresh
 *   npm run refresh -- --project RHOAIENG --hard --concurrency 20
 *
 * Environment variables:
 *   JIRA_TOKEN - Required. Jira API token
 *   BUG_DATA_S3_BUCKET - Required. S3 bucket name
 *   BUG_DATA_S3_PREFIX - Optional. S3 key prefix (default: empty)
 */

import 'dotenv/config';
import { readFromStorage, writeToStorage } from '../server/storage.js';
import { fetchBugs } from '../amplify/backend/function/bugClassifier/src/shared/jira-client.js';
import { classifyBugsBatch, classifyWithRules, buildSummary, needsReclassification } from '../amplify/backend/function/bugClassifier/src/shared/classification.js';
import { buildSnapshot } from '../amplify/backend/function/bugClassifier/src/shared/snapshot.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const projectKey = getArg('--project') || 'RHOAIENG';
const hardRefresh = args.includes('--hard');
const concurrency = parseInt(getArg('--concurrency') || '20', 10);

// Environment variables
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const S3_BUCKET = process.env.BUG_DATA_S3_BUCKET;

function getArg(flag) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return null;
  }
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

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('Bug Classification Refresh');
  console.log('='.repeat(60));
  console.log(`Project:      ${projectKey}`);
  console.log(`S3 Bucket:    ${S3_BUCKET}`);
  console.log(`S3 Prefix:    ${process.env.BUG_DATA_S3_PREFIX || '(none)'}`);
  console.log(`Concurrency:  ${concurrency}`);
  console.log(`Hard Refresh: ${hardRefresh ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Fetch bugs from Jira (including recently resolved for velocity)
    console.log(`[1/7] Fetching bugs from Jira for project ${projectKey} (including resolved)...`);
    const allBugs = await fetchBugs(projectKey, JIRA_TOKEN, { includeResolved: true });
    const openBugs = allBugs.filter(b => !b.isResolved);
    const resolvedBugs = allBugs.filter(b => b.isResolved);
    console.log(`      Found ${openBugs.length} open + ${resolvedBugs.length} recently resolved bugs\n`);

    // Step 2: Load existing classified data for caching
    console.log('[2/7] Loading existing classified data from S3...');
    const existingData = hardRefresh ? null : await readFromStorage(`${projectKey}/classified-bugs.json`);
    const existingBugsMap = new Map();
    if (existingData && existingData.bugs) {
      for (const bug of existingData.bugs) {
        existingBugsMap.set(bug.key, bug);
      }
      console.log(`      Loaded ${existingBugsMap.size} previously classified bugs\n`);
    } else {
      console.log('      No existing data found (will classify all bugs)\n');
    }

    // Step 3: Determine which open bugs need classification
    console.log('[3/7] Determining which open bugs need classification...');
    const cached = [];
    const toClassify = [];

    for (const bug of openBugs) {
      const existing = existingBugsMap.get(bug.key);
      if (existing && !needsReclassification(bug, existing)) {
        cached.push({
          ...bug,
          classification: existing.classification,
          classificationMethod: existing.classificationMethod,
          classificationReason: existing.classificationReason,
          classifiedAt: existing.classifiedAt
        });
      } else {
        toClassify.push(bug);
      }
    }

    console.log(`      Cache hit:  ${cached.length} bugs`);
    console.log(`      To classify: ${toClassify.length} bugs\n`);

    // Step 4: Classify open bugs (rules + LLM)
    console.log(`[4/7] Classifying ${toClassify.length} open bugs with concurrency ${concurrency}...`);
    const freshlyClassified = await classifyBugsBatch(toClassify, concurrency, (done, total, msg) => {
      const percent = Math.round((done / total) * 100);
      console.log(`      [${done}/${total}] ${percent}% - ${msg}`);
    });

    const classifiedOpenBugs = [...cached, ...freshlyClassified];
    console.log(`      Total open classified: ${classifiedOpenBugs.length} bugs\n`);

    // Step 5: Classify resolved bugs (cache + rules only, no LLM to control costs)
    console.log(`[5/7] Classifying ${resolvedBugs.length} resolved bugs (rules only)...`);
    const classifiedResolvedBugs = resolvedBugs.map(bug => {
      const existing = existingBugsMap.get(bug.key);
      if (existing && existing.classification) {
        return {
          ...bug,
          classification: existing.classification,
          classificationMethod: existing.classificationMethod,
          classificationReason: existing.classificationReason,
          classifiedAt: existing.classifiedAt
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
        classificationReason: 'Resolved bug — rules only, no match',
        classifiedAt: new Date().toISOString()
      };
    });
    const resolvedCached = classifiedResolvedBugs.filter(b => existingBugsMap.has(b.key) && existingBugsMap.get(b.key).classification).length;
    console.log(`      ${resolvedCached} from cache, ${classifiedResolvedBugs.length - resolvedCached} rule-classified\n`);

    // Step 6: Build summary and upload to S3 (open bugs only)
    console.log('[6/7] Building summary and uploading to S3...');
    const bugsOutput = {
      lastUpdated: new Date().toISOString(),
      bugs: classifiedOpenBugs
    };
    await writeToStorage(`${projectKey}/classified-bugs.json`, bugsOutput);
    console.log(`      Uploaded ${projectKey}/classified-bugs.json`);

    const summary = buildSummary(classifiedOpenBugs);
    await writeToStorage(`${projectKey}/bug-summary.json`, summary);
    console.log(`      Uploaded ${projectKey}/bug-summary.json`);

    // Step 7: Build and upload monthly snapshot (open + resolved for velocity)
    const now = new Date();
    const snapshotId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    console.log(`\n[7/7] Building snapshot ${snapshotId} and updating index...`);

    const allClassified = [...classifiedOpenBugs, ...classifiedResolvedBugs];
    const snapshot = buildSnapshot(allClassified, projectKey, snapshotId);
    await writeToStorage(`${projectKey}/snapshots/${snapshotId}.json`, snapshot);
    console.log(`      Uploaded ${projectKey}/snapshots/${snapshotId}.json`);

    const releaseCount = Object.keys(snapshot.releases).length;
    console.log(`      ${releaseCount} release groups (${snapshot.versionedBugs} versioned, ${snapshot.unversionedBugs} unversioned)`);
    console.log(`      Data quality: ${snapshot.dataQuality.pctWithVersion}% of bugs have version info`);

    // Update snapshot index
    const existingIndex = await readFromStorage(`${projectKey}/snapshots/index.json`);
    const index = existingIndex || { snapshots: [] };
    const existingEntry = index.snapshots.findIndex(s => s.id === snapshotId);
    const entry = { id: snapshotId, generatedAt: snapshot.generatedAt, totalBugs: snapshot.totalBugs };
    if (existingEntry >= 0) {
      index.snapshots[existingEntry] = entry;
      console.log(`      Updated existing entry in snapshot index`);
    } else {
      index.snapshots.push(entry);
      index.snapshots.sort((a, b) => b.id.localeCompare(a.id));
      console.log(`      Added new entry to snapshot index`);
    }
    await writeToStorage(`${projectKey}/snapshots/index.json`, index);
    console.log(`      Uploaded ${projectKey}/snapshots/index.json`);

    // Success summary
    console.log('');
    console.log('='.repeat(60));
    console.log('SUCCESS!');
    console.log('='.repeat(60));
    console.log(`Open bugs:        ${openBugs.length}`);
    console.log(`Resolved bugs:    ${resolvedBugs.length}`);
    console.log(`Newly classified: ${toClassify.length}`);
    console.log(`From cache:       ${cached.length}`);
    if (snapshot.velocity) {
      console.log(`Velocity:         +${snapshot.velocity.createdInPeriod} created, -${snapshot.velocity.resolvedInPeriod} resolved`);
    }
    console.log(`Last updated:     ${bugsOutput.lastUpdated}`);
    console.log('='.repeat(60));
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('ERROR!');
    console.error('='.repeat(60));
    console.error(error.message);
    if (error.stack) {
      console.error('');
      console.error(error.stack);
    }
    console.error('='.repeat(60));
    console.error('');
    process.exit(1);
  }
}

main();
