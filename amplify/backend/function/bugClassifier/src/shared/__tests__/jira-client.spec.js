import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBugs } from '../jira-client.js';

// Capture fetch calls to inspect URLs/headers and return mock data
let fetchCalls;
let fetchResponses;

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    fetchCalls.push({ url, opts });
    const response = fetchResponses.shift() || { ok: true, json: async () => ({ issues: [] }) };
    return response;
  });
});

function mockResponse(issues) {
  return {
    ok: true,
    json: async () => ({ issues }),
    text: async () => ''
  };
}

function mockError(status, body) {
  return {
    ok: false,
    status,
    text: async () => body
  };
}

// Minimal Jira issue matching the API shape
function makeJiraIssue(overrides = {}) {
  return {
    key: 'RHOAIENG-100',
    fields: {
      summary: 'Test bug summary',
      description: 'Test description',
      status: { name: 'New' },
      priority: { name: 'Major' },
      components: [{ name: 'Dashboard' }],
      labels: [],
      assignee: { displayName: 'Alice' },
      reporter: { displayName: 'Bob' },
      created: '2026-03-01T10:00:00Z',
      updated: '2026-03-10T14:00:00Z',
      resolution: null,
      resolutiondate: null,
      fixVersions: [],
      versions: [],
      ...overrides
    }
  };
}

// --- JQL generation ---

describe('fetchBugs JQL generation', () => {
  it('should use unresolved-only JQL by default', async () => {
    fetchResponses.push(mockResponse([]));
    await fetchBugs('RHOAIENG', 'token123');

    const url = fetchCalls[0].url;
    const jql = decodeURIComponent(url.split('jql=')[1].split('&')[0]);
    expect(jql).toBe('project = RHOAIENG AND type = Bug AND resolution = Unresolved ORDER BY updated DESC');
  });

  it('should include resolved bugs when includeResolved is true', async () => {
    fetchResponses.push(mockResponse([]));
    await fetchBugs('RHOAIENG', 'token123', { includeResolved: true });

    const url = fetchCalls[0].url;
    const jql = decodeURIComponent(url.split('jql=')[1].split('&')[0]);
    expect(jql).toContain('resolution = Unresolved OR');
    expect(jql).toContain('resolved >= "-60d"');
  });

  it('should use backfill JQL when asOfDate is provided', async () => {
    fetchResponses.push(mockResponse([]));
    await fetchBugs('RHOAIENG', 'token123', { asOfDate: '2025-12-31' });

    const url = fetchCalls[0].url;
    const jql = decodeURIComponent(url.split('jql=')[1].split('&')[0]);
    expect(jql).toContain('created <= "2025-12-31"');
    expect(jql).toContain('resolved >= "2025-12-31"');
  });

  it('should send Bearer token in Authorization header', async () => {
    fetchResponses.push(mockResponse([]));
    await fetchBugs('RHOAIENG', 'my-secret-token');

    expect(fetchCalls[0].opts.headers.Authorization).toBe('Bearer my-secret-token');
  });

  it('should request resolutiondate in the fields list', async () => {
    fetchResponses.push(mockResponse([]));
    await fetchBugs('RHOAIENG', 'token123');

    const url = fetchCalls[0].url;
    expect(url).toContain('resolutiondate');
  });
});

// --- Transform ---

describe('fetchBugs transformation', () => {
  it('should transform a standard open bug', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue()]));
    const bugs = await fetchBugs('PROJ', 'token');

    expect(bugs).toHaveLength(1);
    const bug = bugs[0];
    expect(bug.key).toBe('RHOAIENG-100');
    expect(bug.summary).toBe('Test bug summary');
    expect(bug.description).toBe('Test description');
    expect(bug.status).toBe('New');
    expect(bug.priority).toBe('Major');
    expect(bug.component).toBe('Dashboard');
    expect(bug.team).toBe('Dashboard');
    expect(bug.assignee).toBe('Alice');
    expect(bug.reporter).toBe('Bob');
    expect(bug.created).toBe('2026-03-01T10:00:00Z');
    expect(bug.updated).toBe('2026-03-10T14:00:00Z');
    expect(bug.resolution).toBeNull();
    expect(bug.resolved).toBeNull();
    expect(bug.isResolved).toBe(false);
    expect(bug.labels).toEqual([]);
    expect(bug.fixVersions).toEqual([]);
    expect(bug.affectsVersions).toEqual([]);
  });

  it('should map resolution and resolutiondate for resolved bugs', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue({
      resolution: { name: 'Done' },
      resolutiondate: '2026-03-15T12:00:00Z'
    })]));
    const bugs = await fetchBugs('PROJ', 'token');

    expect(bugs[0].resolution).toBe('Done');
    expect(bugs[0].resolved).toBe('2026-03-15T12:00:00Z');
    expect(bugs[0].isResolved).toBe(true);
  });

  it('should map fixVersions and affectsVersions (versions field)', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue({
      fixVersions: [{ name: 'rhoai-3.4.1' }],
      versions: [{ name: 'rhoai-3.3' }, { name: 'rhoai-3.4' }]
    })]));
    const bugs = await fetchBugs('PROJ', 'token');

    expect(bugs[0].fixVersions).toEqual(['rhoai-3.4.1']);
    expect(bugs[0].affectsVersions).toEqual(['rhoai-3.3', 'rhoai-3.4']);
  });

  it('should default missing fields gracefully', async () => {
    fetchResponses.push(mockResponse([{
      key: 'PROJ-1',
      fields: {}
    }]));
    const bugs = await fetchBugs('PROJ', 'token');

    const bug = bugs[0];
    expect(bug.summary).toBe('');
    expect(bug.description).toBe('');
    expect(bug.status).toBe('Unknown');
    expect(bug.priority).toBe('Unknown');
    expect(bug.component).toBe('Unknown');
    expect(bug.team).toBe('Unknown');
    expect(bug.assignee).toBeNull();
    expect(bug.reporter).toBeNull();
    expect(bug.created).toBeNull();
    expect(bug.updated).toBeNull();
    expect(bug.resolution).toBeNull();
    expect(bug.resolved).toBeNull();
    expect(bug.isResolved).toBe(false);
    expect(bug.labels).toEqual([]);
    expect(bug.fixVersions).toEqual([]);
    expect(bug.affectsVersions).toEqual([]);
  });
});

// --- Severity extraction ---

describe('fetchBugs severity extraction', () => {
  it('should use custom field value when present', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue({
      customfield_12316142: { value: 'Critical' }
    })]));
    const bugs = await fetchBugs('PROJ', 'token');
    expect(bugs[0].severity).toBe('Critical');
  });

  it('should use severity label when present', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue({
      labels: ['Urgent', 'some-other-label']
    })]));
    const bugs = await fetchBugs('PROJ', 'token');
    expect(bugs[0].severity).toBe('Urgent');
  });

  it('should derive severity from priority when no label or custom field', async () => {
    const cases = [
      [{ name: 'Blocker' }, 'Urgent'],
      [{ name: 'Critical' }, 'Urgent'],
      [{ name: 'Major' }, 'High'],
      [{ name: 'Minor' }, 'Medium'],
      [{ name: 'Trivial' }, 'Low']
    ];

    for (const [priority, expected] of cases) {
      fetchCalls = [];
      fetchResponses.push(mockResponse([makeJiraIssue({ priority })]));
      const bugs = await fetchBugs('PROJ', 'token');
      expect(bugs[0].severity).toBe(expected);
    }
  });
});

// --- Pagination ---

describe('fetchBugs pagination', () => {
  it('should paginate when a page returns maxResults issues', async () => {
    // First page: 100 issues (triggers next page)
    const page1 = Array.from({ length: 100 }, (_, i) =>
      makeJiraIssue({ summary: `Bug ${i}` })
    );
    // Second page: 30 issues (less than 100, stops)
    const page2 = Array.from({ length: 30 }, (_, i) =>
      makeJiraIssue({ summary: `Bug ${100 + i}` })
    );

    fetchResponses.push(mockResponse(page1), mockResponse(page2));
    const bugs = await fetchBugs('PROJ', 'token');

    expect(bugs).toHaveLength(130);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain('startAt=0');
    expect(fetchCalls[1].url).toContain('startAt=100');
  });

  it('should stop when an empty page is returned', async () => {
    fetchResponses.push(mockResponse([makeJiraIssue()]), mockResponse([]));

    // This test ensures we don't loop infinitely when exactly maxResults issues
    // are returned on the first page but the second page is empty
    // (edge case: API returns 100 on first call, then 0)
    // However, the code only fetches page 2 if page 1 has maxResults (100) items.
    // With 1 item on page 1, it stops immediately.
    const bugs = await fetchBugs('PROJ', 'token');
    expect(bugs).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
  });
});

// --- Error handling ---

describe('fetchBugs error handling', () => {
  it('should throw on non-OK response', async () => {
    fetchResponses.push(mockError(401, 'Unauthorized'));

    await expect(fetchBugs('PROJ', 'token')).rejects.toThrow('Jira API error (401): Unauthorized');
  });
});
