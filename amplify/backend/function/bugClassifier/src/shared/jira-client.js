/**
 * Jira Client
 * Handles fetching bugs from Jira Cloud (read-only)
 */

export const JIRA_HOST = 'https://redhat.atlassian.net';
export const JIRA_API_BASE = `${JIRA_HOST}/rest/api/3`;

/**
 * Convert ADF (Atlassian Document Format) to plain text
 * @param {Object|string|null} adf - ADF document object or plain string
 * @returns {string} - Plain text representation
 */
function adfToPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  if (typeof adf !== 'object') return '';

  let text = '';
  if (adf.text) {
    text += adf.text;
  }
  if (adf.content && Array.isArray(adf.content)) {
    const childTexts = adf.content.map(adfToPlainText);
    text += childTexts.join('');
  }
  // Add newlines after block-level elements
  if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(adf.type)) {
    text += '\n';
  }
  return text;
}

/**
 * Build Basic Auth header value for Jira Cloud
 * @param {string} email - Jira account email
 * @param {string} apiToken - Jira API token
 * @returns {string} - Base64-encoded auth string
 */
function buildBasicAuth(email, apiToken) {
  const credentials = `${email}:${apiToken}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/**
 * Fetch bugs from Jira for a given project
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @param {string} jiraToken - Jira API token
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.jiraEmail] - Jira account email for Basic Auth
 * @param {boolean} [options.includeResolved=false] - Also fetch bugs resolved in the last 60 days
 * @param {string} [options.asOfDate] - For backfill: date string (YYYY-MM-DD) to approximate point-in-time state
 * @returns {Promise<Array>} - Array of bug objects
 */
export async function fetchBugs(projectKey, jiraToken, options = {}) {
  const { includeResolved = false, asOfDate = null, jiraEmail = null } = options;

  let jql;
  if (asOfDate) {
    // Backfill mode: bugs that existed before asOfDate and were either still open or resolved after that date
    jql = `project = ${projectKey} AND type = Bug AND created <= "${asOfDate}" AND (resolution = Unresolved OR resolved >= "${asOfDate}") ORDER BY updated DESC`;
  } else if (includeResolved) {
    // Include recently resolved bugs alongside unresolved
    jql = `project = ${projectKey} AND type = Bug AND (resolution = Unresolved OR (resolution != Unresolved AND resolved >= "-60d")) ORDER BY updated DESC`;
  } else {
    jql = `project = ${projectKey} AND type = Bug AND resolution = Unresolved ORDER BY updated DESC`;
  }

  const fields = [
    'summary',
    'description',
    'status',
    'priority',
    'components',
    'labels',
    'assignee',
    'reporter',
    'created',
    'updated',
    'resolution',
    'resolutiondate',
    'fixVersions',
    'versions', // Affects Version
    'customfield_10840', // Severity
  ];

  const maxResults = 100;
  const allBugs = [];
  let nextPageToken = null;

  const authHeader = jiraEmail
    ? buildBasicAuth(jiraEmail, jiraToken)
    : `Basic ${Buffer.from(jiraToken).toString('base64')}`;

  while (true) {
    const body = {
      jql,
      fields,
      maxResults,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const response = await fetch(`${JIRA_API_BASE}/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.issues || data.issues.length === 0) {
      break;
    }

    allBugs.push(...data.issues);

    if (data.isLast !== false) {
      break;
    }

    nextPageToken = data.nextPageToken;
  }

  return allBugs.map(transformJiraIssue);
}

/**
 * Transform Jira API response to our internal bug model
 * @param {Object} jiraIssue - Raw Jira issue object
 * @returns {Object} - Transformed bug object
 */
function transformJiraIssue(jiraIssue) {
  const fields = jiraIssue.fields;

  const resolution = fields.resolution?.name || null;

  return {
    key: jiraIssue.key,
    summary: fields.summary || '',
    description: adfToPlainText(fields.description),
    status: fields.status?.name || 'Unknown',
    priority: fields.priority?.name || 'Unknown',
    severity: extractSeverity(fields),
    component: extractComponent(fields.components),
    labels: fields.labels || [],
    assignee: fields.assignee?.displayName || null,
    reporter: fields.reporter?.displayName || null,
    created: fields.created || null,
    updated: fields.updated || null,
    resolution,
    resolved: fields.resolutiondate || null,
    isResolved: resolution != null,
    fixVersions: (fields.fixVersions || []).map((v) => v.name),
    affectsVersions: (fields.versions || []).map((v) => v.name),
    team: extractTeam(fields),
  };
}

/**
 * Extract severity from Jira custom fields or labels
 * @param {Object} fields - Jira fields object
 * @returns {string}
 */
function extractSeverity(fields) {
  // Jira Cloud severity custom field
  if (fields.customfield_10840?.value) {
    return fields.customfield_10840.value;
  }

  // Check labels for severity
  const labels = fields.labels || [];
  const severityLabels = ['Urgent', 'High', 'Medium', 'Low'];
  for (const label of labels) {
    if (severityLabels.includes(label)) {
      return label;
    }
  }

  // Default based on priority
  const priority = fields.priority?.name;
  if (priority === 'Blocker' || priority === 'Critical') return 'Urgent';
  if (priority === 'Major') return 'High';
  if (priority === 'Minor') return 'Medium';
  return 'Low';
}

/**
 * Extract primary component from components array
 * @param {Array} components - Array of component objects
 * @returns {string}
 */
function extractComponent(components) {
  if (!components || components.length === 0) {
    return 'Unknown';
  }
  return components[0].name;
}

/**
 * Extract team from component
 * @param {Object} fields - Jira fields object
 * @returns {string}
 */
function extractTeam(fields) {
  // Use the primary component as the team name
  const component = extractComponent(fields.components);
  if (component !== 'Unknown') {
    return component;
  }

  return 'Unknown';
}
