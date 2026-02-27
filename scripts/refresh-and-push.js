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
import { classifyBugsBatch, buildSummary, needsReclassification } from '../amplify/backend/function/bugClassifier/src/shared/classification.js';

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
  console.error('ERROR: BUG_DATA_S3_BUCKET environment variable is not set');
  console.error('This script is designed to push data to S3. For local development, use the dev server refresh endpoint.');
  process.exit(1);
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
    // Step 1: Fetch bugs from Jira
    console.log(`[1/5] Fetching unresolved bugs from Jira for project ${projectKey}...`);
    const bugs = await fetchBugs(projectKey, JIRA_TOKEN);
    console.log(`      Found ${bugs.length} unresolved bugs from Jira\n`);

    // Step 2: Load existing classified data for caching
    console.log('[2/5] Loading existing classified data from S3...');
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

    // Step 3: Determine which bugs need classification
    console.log('[3/5] Determining which bugs need classification...');
    const cached = [];
    const toClassify = [];

    for (const bug of bugs) {
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

    // Step 4: Classify bugs
    console.log(`[4/5] Classifying ${toClassify.length} bugs with concurrency ${concurrency}...`);
    const freshlyClassified = await classifyBugsBatch(toClassify, concurrency, (done, total, msg) => {
      const percent = Math.round((done / total) * 100);
      console.log(`      [${done}/${total}] ${percent}% - ${msg}`);
    });

    const classifiedBugs = [...cached, ...freshlyClassified];
    console.log(`      Total classified: ${classifiedBugs.length} bugs\n`);

    // Step 5: Build summary and upload to S3
    console.log('[5/5] Building summary and uploading to S3...');
    const bugsOutput = {
      lastUpdated: new Date().toISOString(),
      bugs: classifiedBugs
    };
    await writeToStorage(`${projectKey}/classified-bugs.json`, bugsOutput);
    console.log(`      Uploaded ${projectKey}/classified-bugs.json`);

    const summary = buildSummary(classifiedBugs);
    await writeToStorage(`${projectKey}/bug-summary.json`, summary);
    console.log(`      Uploaded ${projectKey}/bug-summary.json`);

    // Success summary
    console.log('');
    console.log('='.repeat(60));
    console.log('SUCCESS!');
    console.log('='.repeat(60));
    console.log(`Total bugs:       ${bugs.length}`);
    console.log(`Newly classified: ${toClassify.length}`);
    console.log(`From cache:       ${cached.length}`);
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
