/**
 * Snapshot Builder
 * Builds monthly snapshot documents from classified bug data,
 * grouped by RHOAI release version.
 */

const RHOAI_VERSION_PATTERN = /^(rhoai-\d+\.\d+)/;
const EA_VERSION_PATTERN = /^rhoai-\d+\.\d+\.EA\d+/i;
const MIN_TRACKED_VERSION = [2, 16];

/**
 * Check if a version string is an EA (Early Access) version
 * @param {string} versionString
 * @returns {boolean}
 */
export function isEaVersion(versionString) {
  return EA_VERSION_PATTERN.test(versionString);
}

/**
 * Roll up a version string to its x.y release.
 * Strips z-stream, EA, and .next suffixes.
 * Groups pre-2.16 versions as "Pre-2.16".
 * Returns null for non-rhoai prefixes (e.g., RHAIIS).
 * @param {string} versionString
 * @returns {string|null} - Rolled-up version, "Pre-2.16", or null if excluded
 */
export function rollupVersion(versionString) {
  const match = versionString.match(RHOAI_VERSION_PATTERN);
  if (!match) {
    return null;
  }

  const rolledUp = match[1];
  const parts = rolledUp.replace('rhoai-', '').split('.').map(Number);
  const [major, minor] = parts;

  if (
    major < MIN_TRACKED_VERSION[0] ||
    (major === MIN_TRACKED_VERSION[0] && minor < MIN_TRACKED_VERSION[1])
  ) {
    return 'Pre-2.16';
  }

  return rolledUp;
}

/**
 * Resolve which release groups a bug belongs to.
 * Uses affectsVersions as primary, fixVersions as fallback.
 * Excludes non-rhoai prefixes. Returns ["Unversioned"] if no valid versions.
 * @param {Object} bug - Bug object with affectsVersions and fixVersions arrays
 * @returns {string[]} - Array of resolved release names
 */
export function resolveVersions(bug) {
  const versions =
    bug.affectsVersions && bug.affectsVersions.length > 0
      ? bug.affectsVersions
      : bug.fixVersions && bug.fixVersions.length > 0
        ? bug.fixVersions
        : [];

  if (versions.length === 0) {
    return ['Unversioned'];
  }

  const resolved = new Set();
  for (const v of versions) {
    const rolledUp = rollupVersion(v);
    if (rolledUp !== null) {
      resolved.add(rolledUp);
    }
  }

  return resolved.size > 0 ? [...resolved] : ['Unversioned'];
}

/**
 * Build a minimal per-bug detail object for snapshot storage
 * @param {Object} bug - Full classified bug object
 * @returns {Object}
 */
function buildBugDetail(bug) {
  const detail = {
    key: bug.key,
    classification: bug.classification,
    priority: bug.priority,
    status: bug.status,
    team: bug.team,
    summary: bug.summary,
    created: bug.created,
    updated: bug.updated,
  };
  if (bug.isResolved) {
    detail.isResolved = true;
    detail.resolved = bug.resolved;
    detail.resolution = bug.resolution;
  }
  return detail;
}

/**
 * Compute the start and end dates for a snapshot period (the full month).
 * @param {string} snapshotId - e.g. "2026-03"
 * @returns {{ start: Date, end: Date }}
 */
function snapshotPeriod(snapshotId) {
  const [year, month] = snapshotId.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Bucket a time-to-resolve duration (in days) into a human-readable category.
 * @param {number} days
 * @returns {string}
 */
function timeToResolveBucket(days) {
  if (days < 7) return '< 1 week';
  if (days < 14) return '1-2 weeks';
  if (days < 28) return '2-4 weeks';
  if (days < 90) return '1-3 months';
  return '3+ months';
}

/**
 * Compute velocity metrics from bugs for a given snapshot period.
 * @param {Array} allBugs - All bugs (open + resolved)
 * @param {number} openBugCount - Count of open bugs
 * @param {string} snapshotId - e.g. "2026-03"
 * @returns {Object|null} - Velocity section, or null if no resolved bugs present
 */
function computeVelocity(allBugs, openBugCount, snapshotId) {
  const hasAnyResolved = allBugs.some((b) => b.isResolved);
  if (!hasAnyResolved) return null;

  const { start, end } = snapshotPeriod(snapshotId);

  let createdInPeriod = 0;
  let resolvedInPeriod = 0;
  const resolvedDurations = [];

  for (const bug of allBugs) {
    const createdDate = bug.created ? new Date(bug.created) : null;
    if (createdDate && createdDate >= start && createdDate <= end) {
      createdInPeriod++;
    }

    if (bug.isResolved && bug.resolved) {
      const resolvedDate = new Date(bug.resolved);
      if (resolvedDate >= start && resolvedDate <= end) {
        resolvedInPeriod++;
        if (createdDate) {
          const days = (resolvedDate - createdDate) / (1000 * 60 * 60 * 24);
          resolvedDurations.push(days);
        }
      }
    }
  }

  const buckets = {
    '< 1 week': 0,
    '1-2 weeks': 0,
    '2-4 weeks': 0,
    '1-3 months': 0,
    '3+ months': 0,
  };
  for (const days of resolvedDurations) {
    buckets[timeToResolveBucket(days)]++;
  }

  const avgTimeToResolveDays =
    resolvedDurations.length > 0
      ? Math.round((resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length) * 10) /
        10
      : null;

  return {
    openBugs: openBugCount,
    createdInPeriod,
    resolvedInPeriod,
    netChange: createdInPeriod - resolvedInPeriod,
    avgTimeToResolveDays,
    timeToResolveBuckets: buckets,
  };
}

/**
 * Build a snapshot document from classified bugs
 * @param {Array} classifiedBugs - Array of classified bug objects
 * @param {string} projectKey - Jira project key (e.g., "RHOAIENG")
 * @param {string} snapshotId - Snapshot identifier (e.g., "2026-03")
 * @returns {Object} - Snapshot document
 */
export function buildSnapshot(classifiedBugs, projectKey, snapshotId) {
  // Separate open and resolved bugs
  const openBugs = classifiedBugs.filter((b) => !b.isResolved);
  const resolvedBugs = classifiedBugs.filter((b) => b.isResolved);

  const releases = {};
  let versionedCount = 0;
  let unversionedCount = 0;
  let affectsVersionCount = 0;
  let fixVersionCount = 0;

  // Track which raw versions mapped to each release for EA counting
  const releaseEaCounts = {};

  // Helper to initialize a release group
  function ensureRelease(release) {
    if (!releases[release]) {
      releases[release] = {
        totalBugs: 0,
        byClassification: {},
        byPriority: {},
        byStatus: {},
        byTeam: {},
        bugKeys: [],
        bugs: [],
      };
      releaseEaCounts[release] = 0;
    }
  }

  // Helper to track EA versions for a bug
  function trackEa(bug, release) {
    const sourceVersions =
      bug.affectsVersions && bug.affectsVersions.length > 0
        ? bug.affectsVersions
        : bug.fixVersions && bug.fixVersions.length > 0
          ? bug.fixVersions
          : [];
    for (const v of sourceVersions) {
      const rolledUp = rollupVersion(v);
      if (rolledUp === release && isEaVersion(v)) {
        releaseEaCounts[release]++;
        break;
      }
    }
  }

  // Process open bugs — counted in aggregates, bugKeys, and totalBugs
  for (const bug of openBugs) {
    if (bug.affectsVersions && bug.affectsVersions.length > 0) affectsVersionCount++;
    if (bug.fixVersions && bug.fixVersions.length > 0) fixVersionCount++;

    const resolvedReleases = resolveVersions(bug);
    const isUnversioned = resolvedReleases.length === 1 && resolvedReleases[0] === 'Unversioned';

    if (isUnversioned) {
      unversionedCount++;
    } else {
      versionedCount++;
    }

    for (const release of resolvedReleases) {
      ensureRelease(release);
      const group = releases[release];
      group.totalBugs++;
      group.bugKeys.push(bug.key);
      group.bugs.push(buildBugDetail(bug));

      const classification = bug.classification || 'uncategorized';
      group.byClassification[classification] = (group.byClassification[classification] || 0) + 1;

      const priority = bug.priority || 'Unknown';
      group.byPriority[priority] = (group.byPriority[priority] || 0) + 1;

      const status = bug.status || 'Unknown';
      group.byStatus[status] = (group.byStatus[status] || 0) + 1;

      const team = bug.team || 'Unknown';
      group.byTeam[team] = (group.byTeam[team] || 0) + 1;

      trackEa(bug, release);
    }
  }

  // Process resolved bugs — added to bugs array only (not aggregates or bugKeys)
  for (const bug of resolvedBugs) {
    const resolvedReleases = resolveVersions(bug);
    for (const release of resolvedReleases) {
      ensureRelease(release);
      releases[release].bugs.push(buildBugDetail(bug));
      trackEa(bug, release);
    }
  }

  // Add eaBugs field only to releases that have EA bugs
  for (const [release, count] of Object.entries(releaseEaCounts)) {
    if (count > 0) {
      releases[release].eaBugs = count;
    }
  }

  // Build global aggregates from open bugs only
  const global = {
    byClassification: {},
    byPriority: {},
    byStatus: {},
    byTeam: {},
  };

  for (const bug of openBugs) {
    const classification = bug.classification || 'uncategorized';
    global.byClassification[classification] = (global.byClassification[classification] || 0) + 1;

    const priority = bug.priority || 'Unknown';
    global.byPriority[priority] = (global.byPriority[priority] || 0) + 1;

    const status = bug.status || 'Unknown';
    global.byStatus[status] = (global.byStatus[status] || 0) + 1;

    const team = bug.team || 'Unknown';
    global.byTeam[team] = (global.byTeam[team] || 0) + 1;
  }

  const totalBugs = openBugs.length;

  // Compute velocity when resolved bugs are present
  const velocity = computeVelocity(classifiedBugs, totalBugs, snapshotId);

  const snapshot = {
    snapshotId,
    snapshotDate: `${snapshotId}-01T00:00:00Z`,
    projectKey,
    generatedAt: new Date().toISOString(),
    totalBugs,
    versionedBugs: versionedCount,
    unversionedBugs: unversionedCount,
    dataQuality: {
      pctWithVersion: totalBugs > 0 ? Math.round((versionedCount / totalBugs) * 1000) / 10 : 0,
      pctWithAffectsVersion:
        totalBugs > 0 ? Math.round((affectsVersionCount / totalBugs) * 1000) / 10 : 0,
      pctWithFixVersion: totalBugs > 0 ? Math.round((fixVersionCount / totalBugs) * 1000) / 10 : 0,
    },
    global,
    releases,
  };

  if (velocity) {
    snapshot.velocity = velocity;
  }

  return snapshot;
}
