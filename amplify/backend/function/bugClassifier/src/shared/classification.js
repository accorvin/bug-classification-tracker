/**
 * Bug Classification Pipeline
 * Implements a tiered approach: rules first, LLM fallback
 */

// LLM classifier is loaded lazily to avoid import errors when vertex SDK isn't configured
let classifyWithLLM = null;
async function getLLMClassifier() {
  if (!classifyWithLLM) {
    try {
      const mod = await import('./llm-classifier.js');
      classifyWithLLM = mod.classifyWithLLM;
    } catch (err) {
      // LLM classifier unavailable (missing SDK or credentials)
      classifyWithLLM = null;
    }
  }
  return classifyWithLLM;
}

// Classification categories
export const CATEGORIES = {
  REGRESSION: 'regression',
  USABILITY: 'usability',
  GENERAL_ENGINEERING: 'general-engineering',
  UNCATEGORIZED: 'uncategorized'
};

/**
 * Tier 1: Rule-based classification (no LLM cost)
 * @param {Object} bug - Bug object with summary, description, labels, component, etc.
 * @returns {Object|null} - { classification, classificationMethod, classificationReason } or null if no match
 */
export function classifyWithRules(bug) {
  const summary = bug.summary || '';
  const description = bug.description || '';
  const labels = bug.labels || [];
  const component = bug.component || '';

  // Check labels for regression
  for (const label of labels) {
    if (label.toLowerCase() === 'regression') {
      return {
        classification: CATEGORIES.REGRESSION,
        classificationMethod: 'rule',
        classificationReason: `Label '${label}' matched rule`
      };
    }
  }

  // Check summary/description for regression (case-insensitive)
  const combinedText = `${summary} ${description}`.toLowerCase();
  if (combinedText.includes('regression')) {
    return {
      classification: CATEGORIES.REGRESSION,
      classificationMethod: 'rule',
      classificationReason: 'Summary or description contains "regression"'
    };
  }

  // Check labels for usability (exact match or known prefixes — no substring)
  const usabilityExactLabels = ['usability', 'ux', 'ui', 'accessibility', 'needs-ux', 'needs-uxd', 'needs_ux', 'ux-debt', 'ux-dev-request'];
  for (const label of labels) {
    const lowerLabel = label.toLowerCase();
    if (usabilityExactLabels.includes(lowerLabel) || lowerLabel.startsWith('ux-') || lowerLabel.startsWith('ux_')) {
      return {
        classification: CATEGORIES.USABILITY,
        classificationMethod: 'rule',
        classificationReason: `Label '${label}' matched usability rule`
      };
    }
  }

  // Check component for usability (exact match only — "Dashboard" alone is NOT usability)
  const usabilityExactComponents = ['uxd', 'frontend'];
  const lowerComponent = component.toLowerCase();
  if (usabilityExactComponents.includes(lowerComponent)) {
    return {
      classification: CATEGORIES.USABILITY,
      classificationMethod: 'rule',
      classificationReason: `Component '${component}' matched usability rule`
    };
  }

  // Check summary for usability keywords (word boundary matching)
  const lowerSummary = summary.toLowerCase();
  const usabilityPatterns = [
    /\busability\b/,
    /\bux\b/,
    /\bui\s+issue/,
    /\bconfusing\b/,
    /\baccessibility\b/
  ];
  for (const pattern of usabilityPatterns) {
    if (pattern.test(lowerSummary)) {
      return {
        classification: CATEGORIES.USABILITY,
        classificationMethod: 'rule',
        classificationReason: `Summary matched usability pattern: ${pattern}`
      };
    }
  }

  // No rule matched
  return null;
}

/**
 * Classify a bug through the full pipeline (rules first, LLM fallback)
 * @param {Object} bug - Bug object
 * @returns {Promise<Object>} - { classification, classificationMethod, classificationReason, classifiedAt }
 */
export async function classifyBug(bug) {
  // Tier 1: Try rule-based classification
  const ruleResult = classifyWithRules(bug);
  if (ruleResult) {
    return {
      ...ruleResult,
      classifiedAt: new Date().toISOString()
    };
  }

  // Tier 2: LLM classification
  try {
    const llmFn = await getLLMClassifier();
    if (!llmFn) {
      throw new Error('LLM classifier not available');
    }
    const llmResult = await llmFn(bug);
    return {
      classification: llmResult.classification || CATEGORIES.UNCATEGORIZED,
      classificationMethod: 'llm',
      classificationReason: llmResult.reason || 'Classified by LLM',
      classifiedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('LLM classification failed:', error);
    // Fallback to uncategorized
    return {
      classification: CATEGORIES.UNCATEGORIZED,
      classificationMethod: 'rule',
      classificationReason: 'Could not classify with rules or LLM',
      classifiedAt: new Date().toISOString()
    };
  }
}

/**
 * Classify multiple bugs concurrently (rules first, LLM for the rest in parallel)
 * @param {Array} bugs - Array of bug objects
 * @param {number} concurrency - Max concurrent LLM calls (default 20)
 * @param {Function} onProgress - Optional callback(classified, total)
 * @returns {Promise<Array>} - Array of classified bug objects
 */
export async function classifyBugsBatch(bugs, concurrency = 20, onProgress = null) {
  const results = [];
  const llmQueue = [];

  // Pass 1: classify with rules
  for (const bug of bugs) {
    const ruleResult = classifyWithRules(bug);
    if (ruleResult) {
      results.push({ ...bug, ...ruleResult, classifiedAt: new Date().toISOString() });
    } else {
      llmQueue.push(bug);
    }
  }

  const ruleCount = results.length;
  let llmDone = 0;
  if (onProgress) onProgress(ruleCount, bugs.length, `${ruleCount} classified by rules, ${llmQueue.length} queued for LLM`);

  // Pass 2: classify remaining with LLM in batches
  const llmFn = await getLLMClassifier();
  
  for (let i = 0; i < llmQueue.length; i += concurrency) {
    const batch = llmQueue.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (bug) => {
        if (!llmFn) {
          return { ...bug, classification: CATEGORIES.UNCATEGORIZED, classificationMethod: 'rule', classificationReason: 'LLM not available', classifiedAt: new Date().toISOString() };
        }
        try {
          const llmResult = await llmFn(bug);
          return { ...bug, classification: llmResult.classification || CATEGORIES.UNCATEGORIZED, classificationMethod: 'llm', classificationReason: llmResult.reason || 'Classified by LLM', classifiedAt: new Date().toISOString() };
        } catch (err) {
          console.error(`LLM failed for ${bug.key}:`, err.message);
          return { ...bug, classification: CATEGORIES.UNCATEGORIZED, classificationMethod: 'rule', classificationReason: 'LLM classification failed: ' + err.message, classifiedAt: new Date().toISOString() };
        }
      })
    );

    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : r.reason);
    }

    llmDone += batch.length;
    if (onProgress) onProgress(ruleCount + llmDone, bugs.length, `LLM: ${llmDone}/${llmQueue.length}`);
  }

  return results;
}

/**
 * Check if a bug needs reclassification (bug was updated after last classification)
 * @param {Object} bug - Bug object with updated timestamp
 * @param {Object} classifiedBug - Previously classified bug with classifiedAt timestamp
 * @returns {boolean}
 */
export function needsReclassification(bug, classifiedBug) {
  if (!classifiedBug || !classifiedBug.classifiedAt) {
    return true;
  }

  const bugUpdated = new Date(bug.updated);
  const lastClassified = new Date(classifiedBug.classifiedAt);

  return bugUpdated > lastClassified;
}

/**
 * Build summary statistics from classified bugs
 * @param {Array} bugs - Array of classified bugs
 * @returns {Object} - Summary object with counts and breakdowns
 */
export function buildSummary(bugs) {
  const summary = {
    lastUpdated: new Date().toISOString(),
    totalBugs: bugs.length,
    byClassification: {},
    byPriority: {},
    byTeam: {},
    byVersion: {}
  };

  // Initialize classification buckets
  for (const category of Object.values(CATEGORIES)) {
    summary.byClassification[category] = {
      count: 0,
      bySeverity: {},
      byTeam: {}
    };
  }

  // Aggregate data
  for (const bug of bugs) {
    const classification = bug.classification || CATEGORIES.UNCATEGORIZED;
    const priority = bug.priority || 'Unknown';
    const team = bug.team || 'Unknown';
    const severity = bug.severity || 'Unknown';

    // By classification
    if (summary.byClassification[classification]) {
      summary.byClassification[classification].count++;

      // By severity within classification
      if (!summary.byClassification[classification].bySeverity[severity]) {
        summary.byClassification[classification].bySeverity[severity] = 0;
      }
      summary.byClassification[classification].bySeverity[severity]++;

      // By team within classification
      if (!summary.byClassification[classification].byTeam[team]) {
        summary.byClassification[classification].byTeam[team] = 0;
      }
      summary.byClassification[classification].byTeam[team]++;
    }

    // By priority
    if (!summary.byPriority[priority]) {
      summary.byPriority[priority] = 0;
    }
    summary.byPriority[priority]++;

    // By team
    if (!summary.byTeam[team]) {
      summary.byTeam[team] = 0;
    }
    summary.byTeam[team]++;

    // By version (affects versions)
    const versions = bug.affectsVersions || [];
    if (versions.length === 0) {
      summary.byVersion['Unset'] = (summary.byVersion['Unset'] || 0) + 1;
    } else {
      for (const version of versions) {
        summary.byVersion[version] = (summary.byVersion[version] || 0) + 1;
      }
    }
  }

  return summary;
}
