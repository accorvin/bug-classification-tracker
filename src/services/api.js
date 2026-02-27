/**
 * API Service
 * Handles communication with the backend
 * Automatically includes Firebase ID token in requests
 */

import { useAuth } from '../composables/useAuth';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '/api';

/**
 * Get Firebase ID token for authentication
 */
async function getAuthToken() {
  const { getIdToken, loading, user } = useAuth();

  // Wait for auth initialization to complete
  if (loading.value) {
    await new Promise((resolve) => {
      const checkLoading = setInterval(() => {
        if (!loading.value) {
          clearInterval(checkLoading);
          resolve();
        }
      }, 50);

      // Timeout after 10 seconds to prevent infinite waiting
      setTimeout(() => {
        clearInterval(checkLoading);
        resolve();
      }, 10000);
    });
  }

  try {
    return await getIdToken();
  } catch (error) {
    console.error('Failed to get auth token:', error);
    throw new Error('Authentication required. Please sign in again.');
  }
}

/**
 * Refresh bugs from Jira and classify them via SSE stream.
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @param {Object} options
 * @param {number} [options.concurrency=20] - LLM concurrency
 * @param {Function} [options.onProgress] - Callback for progress events: (data) => void
 * @returns {Promise<Object>} - Resolves with the complete event data on success
 */
export function refreshBugs(projectKey = 'RHOAIENG', { concurrency = 20, hardRefresh = false, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ project: projectKey, concurrency: String(concurrency) });
    if (hardRefresh) params.set('hard', '1');
    const url = `${API_ENDPOINT}/refresh?${params}`;

    const es = new EventSource(url);

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (onProgress) onProgress(data);
      } catch (err) {
        console.warn('Failed to parse progress event:', err);
      }
    });

    es.addEventListener('complete', (e) => {
      es.close();
      try {
        resolve(JSON.parse(e.data));
      } catch (err) {
        reject(new Error('Failed to parse complete event'));
      }
    });

    es.addEventListener('error', (e) => {
      es.close();
      try {
        const data = JSON.parse(e.data);
        reject(new Error(data.error || 'Refresh failed'));
      } catch {
        // EventSource connection error (not a server-sent error event)
        reject(new Error('Connection error during refresh'));
      }
    });
  });
}

/**
 * Get bugs with optional filters
 * @param {Object} params - Query parameters { classification, priority, team, dateFrom, dateTo, project }
 * @returns {Promise<Object>} - { bugs, lastUpdated }
 */
export async function getBugs(params = {}) {
  try {
    const token = await getAuthToken();
    const queryParams = new URLSearchParams(params);

    const response = await fetch(`${API_ENDPOINT}/bugs?${queryParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (response.status === 500 && errorData.error?.includes('not found')) {
        throw new Error('No data found. Please refresh to fetch data from Jira.');
      }

      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get bugs error:', error);
    throw error;
  }
}

/**
 * Get a single bug by key
 * @param {string} bugKey - Bug key (e.g., 'RHOAIENG-12345')
 * @param {string} projectKey - Project key
 * @returns {Promise<Object>} - Bug object
 */
export async function getBug(bugKey, projectKey = 'RHOAIENG') {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_ENDPOINT}/bugs/${bugKey}?project=${projectKey}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (response.status === 404) {
        throw new Error(`Bug ${bugKey} not found`);
      }

      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get bug error:', error);
    throw error;
  }
}

/**
 * Get summary statistics
 * @param {string} projectKey - Project key
 * @returns {Promise<Object>} - Summary object
 */
export async function getSummary(projectKey = 'RHOAIENG') {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_ENDPOINT}/summary?project=${projectKey}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      }

      if (response.status === 500 && errorData.error?.includes('not found')) {
        throw new Error('No summary data found. Please refresh to fetch data from Jira.');
      }

      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get summary error:', error);
    throw error;
  }
}
