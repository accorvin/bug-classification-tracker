import serverlessExpress from '@codegenie/serverless-express';
import express from 'express';
import { readFromStorage } from './storage.mjs';

const app = express();

// CORS safety net (Amplify rewrites make this unnecessary, but keeps
// direct API Gateway access working for curl/testing)
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/config', async function (req, res) {
  const projectKey = req.query.project || 'RHOAIENG';

  let lastUpdated = null;
  try {
    const data = await readFromStorage(`${projectKey}/classified-bugs.json`);
    if (data && data.lastUpdated) {
      lastUpdated = data.lastUpdated;
    }
  } catch (error) {
    console.error('Error reading lastUpdated:', error);
  }

  res.json({ refreshEnabled: false, lastUpdated });
});

app.get('/api/bugs', async function (req, res) {
  const { classification, priority, team, dateFrom, dateTo } = req.query;
  const projectKey = req.query.project || 'RHOAIENG';

  const data = await readFromStorage(`${projectKey}/classified-bugs.json`);
  if (!data) {
    return res.status(500).json({ error: `No data found for project ${projectKey}.` });
  }

  let bugs = data.bugs || [];

  if (classification) bugs = bugs.filter(b => b.classification === classification);
  if (priority) bugs = bugs.filter(b => b.priority === priority);
  if (team) bugs = bugs.filter(b => b.team === team);
  if (dateFrom) bugs = bugs.filter(b => new Date(b.created) >= new Date(dateFrom));
  if (dateTo) bugs = bugs.filter(b => new Date(b.created) <= new Date(dateTo));

  res.json({ bugs, lastUpdated: data.lastUpdated });
});

app.get('/api/bugs/:key', async function (req, res) {
  const projectKey = req.query.project || 'RHOAIENG';
  const data = await readFromStorage(`${projectKey}/classified-bugs.json`);

  if (!data) {
    return res.status(500).json({ error: `No data found for project ${projectKey}.` });
  }

  const bug = (data.bugs || []).find(b => b.key === req.params.key);
  if (!bug) {
    return res.status(404).json({ error: `Bug ${req.params.key} not found` });
  }

  res.json(bug);
});

app.get('/api/summary', async function (req, res) {
  const projectKey = req.query.project || 'RHOAIENG';
  const data = await readFromStorage(`${projectKey}/bug-summary.json`);

  if (!data) {
    return res.status(500).json({ error: `No summary data found for project ${projectKey}.` });
  }

  res.json(data);
});

app.get('/api/refresh', function (req, res) {
  res.status(403).json({ error: 'Refresh disabled — use the local refresh script (npm run refresh)' });
});

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = serverlessExpress({ app });
