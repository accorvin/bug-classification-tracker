/**
 * Jira Client
 * Handles fetching bugs from Jira (read-only)
 */

export const JIRA_HOST = 'https://issues.redhat.com';
export const JIRA_API_BASE = `${JIRA_HOST}/rest/api/2`;

/**
 * Fetch bugs from Jira for a given project
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @param {string} jiraToken - Jira personal access token
 * @returns {Promise<Array>} - Array of bug objects
 */
export async function fetchBugs(projectKey, jiraToken) {
  const jql = `project = ${projectKey} AND type = Bug AND resolution = Unresolved ORDER BY updated DESC`;
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
    'fixVersions',
    'customfield_12311140' // Example custom field for team/scrum team
  ].join(',');

  let startAt = 0;
  const maxResults = 100;
  const allBugs = [];

  while (true) {
    const url = `${JIRA_API_BASE}/search?jql=${encodeURIComponent(jql)}&fields=${fields}&startAt=${startAt}&maxResults=${maxResults}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${jiraToken}`,
        'Accept': 'application/json'
      }
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

    if (data.issues.length < maxResults) {
      break;
    }

    startAt += maxResults;
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

  return {
    key: jiraIssue.key,
    summary: fields.summary || '',
    description: fields.description || '',
    status: fields.status?.name || 'Unknown',
    priority: fields.priority?.name || 'Unknown',
    severity: extractSeverity(fields),
    component: extractComponent(fields.components),
    labels: fields.labels || [],
    assignee: fields.assignee?.displayName || null,
    reporter: fields.reporter?.displayName || null,
    created: fields.created || null,
    updated: fields.updated || null,
    resolution: fields.resolution?.name || null,
    fixVersions: (fields.fixVersions || []).map(v => v.name),
    team: extractTeam(fields)
  };
}

/**
 * Extract severity from Jira custom fields or labels
 * @param {Object} fields - Jira fields object
 * @returns {string}
 */
function extractSeverity(fields) {
  // Check if there's a severity custom field (adjust field ID as needed)
  // This is a placeholder - adjust based on actual Jira configuration
  if (fields.customfield_12316142?.value) {
    return fields.customfield_12316142.value;
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
 * Extract team from custom fields
 * @param {Object} fields - Jira fields object
 * @returns {string}
 */
function extractTeam(fields) {
  // Check for scrum team custom field (adjust field ID as needed)
  // This is a placeholder - adjust based on actual Jira configuration
  if (fields.customfield_12311140?.value) {
    return fields.customfield_12311140.value;
  }

  // Try to extract from other custom fields
  if (fields.customfield_12311140) {
    return fields.customfield_12311140;
  }

  // Default to component-based team name
  const component = extractComponent(fields.components);
  if (component !== 'Unknown') {
    return `${component} Team`;
  }

  return 'Unknown';
}
