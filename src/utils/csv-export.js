/**
 * Client-side CSV export utility.
 * Generates CSV strings and triggers browser downloads.
 */

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

function download(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export snapshot data as CSV (one row per bug-release pair).
 * @param {Object} snapshot - Snapshot document
 */
export function exportSnapshotCsv(snapshot) {
  const headers = [
    'Key',
    'Summary',
    'Classification',
    'Priority',
    'Status',
    'Team',
    'Affected Release',
    'Created',
    'Updated',
  ];
  const rows = [];

  for (const [release, group] of Object.entries(snapshot.releases || {})) {
    for (const bug of group.bugs || []) {
      rows.push([
        bug.key,
        bug.summary,
        bug.classification,
        bug.priority,
        bug.status,
        bug.team,
        release,
        bug.created,
        bug.updated,
      ]);
    }
  }

  download(toCsv(headers, rows), `snapshot-${snapshot.snapshotId}.csv`);
}

/**
 * Export comparison data as CSV (one row per release-metric pair).
 * @param {Object} comparison - Comparison document from compareSnapshots()
 */
export function exportComparisonCsv(comparison) {
  const headers = ['Release', 'Metric', 'Previous Value', 'Current Value', 'Delta'];
  const rows = [];

  // Global row
  rows.push([
    '(Global)',
    'Total Bugs',
    comparison.global.totalBugsDelta >= 0 ? '' : '',
    '',
    comparison.global.totalBugsDelta,
  ]);

  for (const [cat, data] of Object.entries(comparison.global.byClassification || {})) {
    rows.push(['(Global)', cat, data.from, data.to, data.delta]);
  }

  // Per-release rows
  for (const [release, data] of Object.entries(comparison.releases || {})) {
    rows.push([release, 'Total Bugs', data.fromTotal, data.toTotal, data.totalBugsDelta]);
    rows.push([release, 'Inflow', '', '', data.inflow]);
    rows.push([release, 'Outflow', '', '', data.outflow]);
    for (const [cat, catData] of Object.entries(data.byClassification || {})) {
      rows.push([release, cat, catData.from, catData.to, catData.delta]);
    }
  }

  download(toCsv(headers, rows), `comparison-${comparison.from}-to-${comparison.to}.csv`);
}

/**
 * Export trends data as CSV (one row per month-release pair).
 * @param {Array} snapshots - Array of snapshot documents (chronological)
 * @param {Array} velocityData - Array of { label, inflow, outflow, netChange }
 */
export function exportTrendsCsv(snapshots, velocityData) {
  const headers = [
    'Month',
    'Release',
    'Total Bugs',
    'Regressions',
    'Usability',
    'General Engineering',
    'Uncategorized',
    'Inflow',
    'Outflow',
    'Net Change',
  ];
  const rows = [];

  // Build velocity lookup keyed by snapshotId
  const velocityById = {};
  for (const v of velocityData) {
    velocityById[v.snapshotId] = v;
  }

  for (const snapshot of snapshots) {
    for (const [release, group] of Object.entries(snapshot.releases || {})) {
      const vel = velocityById[snapshot.snapshotId];
      rows.push([
        snapshot.snapshotId,
        release,
        group.totalBugs,
        (group.byClassification || {}).regression || 0,
        (group.byClassification || {}).usability || 0,
        (group.byClassification || {})['general-engineering'] || 0,
        (group.byClassification || {}).uncategorized || 0,
        vel ? vel.inflow : '',
        vel ? vel.outflow : '',
        vel ? vel.netChange : '',
      ]);
    }
  }

  const first = snapshots[0]?.snapshotId || 'unknown';
  const last = snapshots[snapshots.length - 1]?.snapshotId || 'unknown';
  download(toCsv(headers, rows), `trends-${first}-to-${last}.csv`);
}
