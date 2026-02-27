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
 * Refresh bugs from Jira and classify them
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @returns {Promise<Object>}
 */
export async function refreshBugs(projectKey = 'RHOAIENG') {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_ENDPOINT}/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project: projectKey })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Refresh bugs error:', error);

    if (error.message.includes('401')) {
      throw new Error('Authentication failed. Please sign in again.');
    }

    throw new Error(error.message || 'Failed to refresh bugs');
  }
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
