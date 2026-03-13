/**
 * Client-side snapshot comparison utility.
 * Computes deltas between any two snapshots for arbitrary month-to-month comparison.
 */

/**
 * Diff two objects with numeric values, producing { key: { from, to, delta } }
 */
function diffCounts(fromObj, toObj) {
  const allKeys = new Set([...Object.keys(fromObj || {}), ...Object.keys(toObj || {})]);
  const result = {};
  for (const key of allKeys) {
    const fromVal = (fromObj || {})[key] || 0;
    const toVal = (toObj || {})[key] || 0;
    result[key] = { from: fromVal, to: toVal, delta: toVal - fromVal };
  }
  return result;
}

/**
 * Diff two bugKeys arrays, returning inflow and outflow keys.
 */
function diffBugKeys(fromKeys, toKeys) {
  const fromSet = new Set(fromKeys || []);
  const toSet = new Set(toKeys || []);
  const newBugKeys = [...toSet].filter(k => !fromSet.has(k));
  const resolvedBugKeys = [...fromSet].filter(k => !toSet.has(k));
  return { newBugKeys, resolvedBugKeys };
}

/**
 * Compare two snapshots and return a comparison document.
 * Supports arbitrary month pairs (not just consecutive).
 *
 * @param {Object} fromSnapshot - The baseline snapshot (earlier month)
 * @param {Object} toSnapshot - The target snapshot (later month)
 * @returns {Object} - Comparison document
 */
export function compareSnapshots(fromSnapshot, toSnapshot) {
  const fromReleases = fromSnapshot.releases || {};
  const toReleases = toSnapshot.releases || {};
  const allReleaseNames = new Set([...Object.keys(fromReleases), ...Object.keys(toReleases)]);

  // Global comparison
  const global = {
    totalBugsDelta: toSnapshot.totalBugs - fromSnapshot.totalBugs,
    byClassification: diffCounts(
      fromSnapshot.global?.byClassification,
      toSnapshot.global?.byClassification
    ),
    byPriority: diffCounts(
      fromSnapshot.global?.byPriority,
      toSnapshot.global?.byPriority
    ),
    byStatus: diffCounts(
      fromSnapshot.global?.byStatus,
      toSnapshot.global?.byStatus
    )
  };

  // Per-release comparison
  const releases = {};
  let totalInflow = 0;
  let totalOutflow = 0;

  for (const name of allReleaseNames) {
    const fromRelease = fromReleases[name] || { totalBugs: 0, bugKeys: [], byClassification: {} };
    const toRelease = toReleases[name] || { totalBugs: 0, bugKeys: [], byClassification: {} };
    const { newBugKeys, resolvedBugKeys } = diffBugKeys(fromRelease.bugKeys, toRelease.bugKeys);

    releases[name] = {
      totalBugsDelta: toRelease.totalBugs - fromRelease.totalBugs,
      fromTotal: fromRelease.totalBugs,
      toTotal: toRelease.totalBugs,
      newBugKeys,
      resolvedBugKeys,
      inflow: newBugKeys.length,
      outflow: resolvedBugKeys.length,
      byClassification: diffCounts(fromRelease.byClassification, toRelease.byClassification)
    };

    totalInflow += newBugKeys.length;
    totalOutflow += resolvedBugKeys.length;
  }

  // Use precise velocity from snapshot data if available (Stage 2),
  // otherwise estimate from bugKeys diffs (Stage 1)
  const hasVelocity = fromSnapshot.velocity && toSnapshot.velocity;
  const velocity = hasVelocity
    ? {
        netChange: toSnapshot.velocity.openBugs - fromSnapshot.velocity.openBugs,
        inflow: toSnapshot.velocity.createdInPeriod || 0,
        outflow: toSnapshot.velocity.resolvedInPeriod || 0
      }
    : {
        netChange: toSnapshot.totalBugs - fromSnapshot.totalBugs,
        inflow: totalInflow,
        outflow: totalOutflow
      };

  return {
    from: fromSnapshot.snapshotId,
    to: toSnapshot.snapshotId,
    global,
    releases,
    velocity
  };
}
