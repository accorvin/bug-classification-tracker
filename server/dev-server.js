/**
 * Local development server
 * Replaces AWS Lambda + API Gateway + S3 with Express + local JSON files.
 * No Firebase auth required — all routes are open for local dev.
 */

import express from 'express';
import { readFromStorage, writeToStorage } from './storage.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import shared business logic (ESM)
let classifyBug, classifyBugsBatch, buildSummary, needsReclassification, fetchBugs;

const app = express();
app.use(express.json());

// CORS
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

const PORT = process.env.API_PORT || 3001;
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const JIRA_HOST = process.env.JIRA_HOST || 'https://issues.redhat.com';

// ---------------------------------------------------------------------------
// Initialize shared modules
// ---------------------------------------------------------------------------

let modulesLoaded = false;

async function loadModules() {
  if (modulesLoaded) return;

  try {
    const classificationModule = await import('../amplify/backend/function/bugClassifier/src/shared/classification.js');
    const jiraClientModule = await import('../amplify/backend/function/bugClassifier/src/shared/jira-client.js');

    classifyBug = classificationModule.classifyBug;
    classifyBugsBatch = classificationModule.classifyBugsBatch;
    buildSummary = classificationModule.buildSummary;
    needsReclassification = classificationModule.needsReclassification;
    fetchBugs = jiraClientModule.fetchBugs;

    modulesLoaded = true;
    console.log('Shared modules loaded successfully');
  } catch (error) {
    console.error('Failed to load shared modules:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reader routes (read JSON from data/ directory)
// ---------------------------------------------------------------------------

app.get('/api/bugs', function(req, res) {
  const { classification, priority, team, dateFrom, dateTo } = req.query;
  const projectKey = req.query.project || 'RHOAIENG';

  const data = readFromStorage(`${projectKey}/classified-bugs.json`);
  if (!data) {
    return res.status(500).json({ error: `No data found for project ${projectKey}. Please refresh to fetch data from Jira.` });
  }

  let bugs = data.bugs || [];

  // Apply filters
  if (classification) {
    bugs = bugs.filter(b => b.classification === classification);
  }
  if (priority) {
    bugs = bugs.filter(b => b.priority === priority);
  }
  if (team) {
    bugs = bugs.filter(b => b.team === team);
  }
  if (dateFrom) {
    bugs = bugs.filter(b => new Date(b.created) >= new Date(dateFrom));
  }
  if (dateTo) {
    bugs = bugs.filter(b => new Date(b.created) <= new Date(dateTo));
  }

  res.json({ bugs, lastUpdated: data.lastUpdated });
});

app.get('/api/bugs/:key', function(req, res) {
  const projectKey = req.query.project || 'RHOAIENG';
  const data = readFromStorage(`${projectKey}/classified-bugs.json`);

  if (!data) {
    return res.status(500).json({ error: `No data found for project ${projectKey}` });
  }

  const bug = (data.bugs || []).find(b => b.key === req.params.key);
  if (!bug) {
    return res.status(404).json({ error: `Bug ${req.params.key} not found` });
  }

  res.json(bug);
});

app.get('/api/summary', function(req, res) {
  const projectKey = req.query.project || 'RHOAIENG';
  const data = readFromStorage(`${projectKey}/bug-summary.json`);

  if (!data) {
    return res.status(500).json({ error: `No summary data found for project ${projectKey}. Please refresh to fetch data from Jira.` });
  }

  res.json(data);
});

// ---------------------------------------------------------------------------
// Refresh route (fetch from Jira and classify) — SSE streaming
// ---------------------------------------------------------------------------

app.get('/api/refresh', async function(req, res) {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    await loadModules();

    const projectKey = req.query.project || 'RHOAIENG';
    const concurrency = parseInt(req.query.concurrency, 10) || 20;

    if (!JIRA_TOKEN) {
      sendEvent('error', { error: 'JIRA_TOKEN environment variable is not set. Add it to your .env file.' });
      res.end();
      return;
    }

    console.log(`Fetching unresolved bugs from Jira for project ${projectKey}...`);
    sendEvent('progress', { phase: 'fetching', message: 'Fetching bugs from Jira...' });

    // Fetch bugs from Jira (only unresolved)
    const bugs = await fetchBugs(projectKey, JIRA_TOKEN);
    console.log(`Found ${bugs.length} unresolved bugs from Jira`);

    // Load previously classified bugs — reuse classifications that haven't changed
    const existingData = readFromStorage(`${projectKey}/classified-bugs.json`);
    const existingBugsMap = new Map();
    if (existingData && existingData.bugs) {
      for (const bug of existingData.bugs) {
        existingBugsMap.set(bug.key, bug);
      }
    }

    // Split into cached (reuse) and needs-classification
    const cached = [];
    const toClassify = [];

    for (const bug of bugs) {
      const existing = existingBugsMap.get(bug.key);
      if (existing && !needsReclassification(bug, existing)) {
        cached.push({ ...bug, classification: existing.classification, classificationMethod: existing.classificationMethod, classificationReason: existing.classificationReason, classifiedAt: existing.classifiedAt });
      } else {
        toClassify.push(bug);
      }
    }

    console.log(`Cache hit: ${cached.length}, need classification: ${toClassify.length}`);

    // Send initial classifying event with cache info
    sendEvent('progress', {
      phase: 'classifying',
      classified: cached.length,
      total: bugs.length,
      message: `${cached.length} cached, ${toClassify.length} to classify`
    });

    // Batch classify with concurrency — stream progress via SSE
    const freshlyClassified = await classifyBugsBatch(toClassify, concurrency, (done, total, msg) => {
      console.log(`  [${done}/${total}] ${msg}`);
      sendEvent('progress', {
        phase: 'classifying',
        classified: cached.length + done,
        total: bugs.length,
        message: `LLM: ${msg}`
      });
    });

    const classifiedBugs = [...cached, ...freshlyClassified];

    // Save
    const bugsOutput = {
      lastUpdated: new Date().toISOString(),
      bugs: classifiedBugs
    };
    writeToStorage(`${projectKey}/classified-bugs.json`, bugsOutput);

    const summary = buildSummary(classifiedBugs);
    writeToStorage(`${projectKey}/bug-summary.json`, summary);

    console.log(`Saved ${classifiedBugs.length} classified bugs and summary`);

    sendEvent('complete', {
      success: true,
      totalBugs: bugs.length,
      classified: toClassify.length,
      skipped: cached.length,
      summary
    });
    res.end();
  } catch (error) {
    console.error('Refresh error:', error);
    sendEvent('error', { error: error.message });
    res.end();
  }
});

// CORS preflight (Express 5 uses /api/* syntax with named wildcard)
app.options('/api/*path', function(req, res) {
  res.status(200).end();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, function() {
  console.log(`\n  Local dev server running at http://localhost:${PORT}`);
  console.log(`  JIRA_TOKEN: ${JIRA_TOKEN ? 'set' : 'NOT SET (refresh will fail)'}`);
  console.log(`  Jira host:  ${JIRA_HOST}\n`);
});
