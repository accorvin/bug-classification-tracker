import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSnapshotCsv, exportComparisonCsv, exportTrendsCsv } from '../utils/csv-export';

// Capture the CSV content and filename passed to download()
let lastDownload;

beforeEach(() => {
  lastDownload = null;

  // jsdom doesn't implement URL.createObjectURL/revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();

  // Intercept Blob constructor to capture CSV content
  const OriginalBlob = globalThis.Blob;
  vi.spyOn(globalThis, 'Blob').mockImplementation((parts, options) => {
    lastDownload = { content: parts[0], filename: null };
    return new OriginalBlob(parts, options);
  });

  // Patch createElement to capture filename from link.download
  vi.spyOn(document, 'createElement').mockImplementation(() => {
    const el = { click: vi.fn() };
    Object.defineProperty(el, 'download', {
      set(val) { if (lastDownload) lastDownload.filename = val; },
      get() { return lastDownload?.filename; }
    });
    return el;
  });
});

function csvLines() {
  return lastDownload.content.split('\n');
}

// --- Escaping ---

describe('CSV escaping', () => {
  it('should escape values containing commas', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [{ key: 'BUG-1', summary: 'Fix foo, bar issue', classification: 'regression', priority: 'Major', status: 'New', team: 'TeamA', created: '2026-01-01', updated: '2026-01-02' }]
        }
      }
    });

    const dataRow = csvLines()[1];
    expect(dataRow).toContain('"Fix foo, bar issue"');
  });

  it('should escape values containing double quotes', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [{ key: 'BUG-2', summary: 'Error in "parse" function', classification: 'usability', priority: 'Minor', status: 'New', team: 'TeamB', created: '2026-01-01', updated: '2026-01-02' }]
        }
      }
    });

    const dataRow = csvLines()[1];
    expect(dataRow).toContain('"Error in ""parse"" function"');
  });

  it('should escape values containing newlines', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [{ key: 'BUG-3', summary: 'Line1\nLine2', classification: 'regression', priority: 'Critical', status: 'New', team: 'TeamC', created: '2026-01-01', updated: '2026-01-02' }]
        }
      }
    });

    // The escaped value should be quoted, so the raw content will contain the literal newline inside quotes
    expect(lastDownload.content).toContain('"Line1\nLine2"');
  });

  it('should handle null and undefined values', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [{ key: 'BUG-4', summary: null, classification: undefined, priority: 'Major', status: 'New', team: 'TeamD', created: '2026-01-01', updated: '2026-01-02' }]
        }
      }
    });

    const dataRow = csvLines()[1];
    // null/undefined become empty strings — two consecutive commas
    expect(dataRow).toBe('BUG-4,,,Major,New,TeamD,rhoai-2.18,2026-01-01,2026-01-02');
  });

  it('should not quote plain values', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [{ key: 'BUG-5', summary: 'Simple summary', classification: 'regression', priority: 'Major', status: 'New', team: 'TeamE', created: '2026-01-01', updated: '2026-01-02' }]
        }
      }
    });

    const dataRow = csvLines()[1];
    expect(dataRow).toBe('BUG-5,Simple summary,regression,Major,New,TeamE,rhoai-2.18,2026-01-01,2026-01-02');
  });
});

// --- exportSnapshotCsv ---

describe('exportSnapshotCsv', () => {
  it('should produce correct headers', () => {
    exportSnapshotCsv({ snapshotId: '2026-01', releases: {} });

    expect(csvLines()[0]).toBe('Key,Summary,Classification,Priority,Status,Team,Affected Release,Created,Updated');
  });

  it('should produce one row per bug-release pair', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': {
          bugs: [
            { key: 'A', summary: 's1', classification: 'regression', priority: 'Major', status: 'New', team: 'T1', created: 'c1', updated: 'u1' },
            { key: 'B', summary: 's2', classification: 'usability', priority: 'Minor', status: 'Open', team: 'T2', created: 'c2', updated: 'u2' }
          ]
        },
        'rhoai-2.19': {
          bugs: [
            { key: 'C', summary: 's3', classification: 'regression', priority: 'Critical', status: 'New', team: 'T3', created: 'c3', updated: 'u3' }
          ]
        }
      }
    });

    const lines = csvLines();
    expect(lines.length).toBe(4); // 1 header + 3 data rows
    expect(lines[1]).toContain('rhoai-2.18');
    expect(lines[2]).toContain('rhoai-2.18');
    expect(lines[3]).toContain('rhoai-2.19');
  });

  it('should handle releases with no bugs array', () => {
    exportSnapshotCsv({
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': { totalBugs: 0 }
      }
    });

    const lines = csvLines();
    expect(lines.length).toBe(1); // header only
  });

  it('should use correct filename', () => {
    exportSnapshotCsv({ snapshotId: '2026-03', releases: {} });
    expect(lastDownload.filename).toBe('snapshot-2026-03.csv');
  });
});

// --- exportComparisonCsv ---

describe('exportComparisonCsv', () => {
  const comparison = {
    from: '2026-01',
    to: '2026-02',
    global: {
      totalBugsDelta: 12,
      byClassification: {
        regression: { from: 20, to: 25, delta: 5 },
        usability: { from: 30, to: 28, delta: -2 }
      }
    },
    releases: {
      'rhoai-2.18': {
        fromTotal: 10,
        toTotal: 14,
        totalBugsDelta: 4,
        inflow: 6,
        outflow: 2,
        byClassification: {
          regression: { from: 5, to: 8, delta: 3 }
        }
      }
    }
  };

  it('should produce correct headers', () => {
    exportComparisonCsv(comparison);
    expect(csvLines()[0]).toBe('Release,Metric,Previous Value,Current Value,Delta');
  });

  it('should include global and per-release rows', () => {
    exportComparisonCsv(comparison);
    const lines = csvLines();
    // 1 header + 1 global total + 2 global classification + 1 release total + 1 inflow + 1 outflow + 1 release classification = 8
    expect(lines.length).toBe(8);
    expect(lines[1]).toContain('(Global)');
    expect(lines[1]).toContain('Total Bugs');
  });

  it('should include inflow and outflow rows per release', () => {
    exportComparisonCsv(comparison);
    const lines = csvLines();
    const inflowRow = lines.find(l => l.includes('rhoai-2.18') && l.includes('Inflow'));
    const outflowRow = lines.find(l => l.includes('rhoai-2.18') && l.includes('Outflow'));
    expect(inflowRow).toContain(',6');
    expect(outflowRow).toContain(',2');
  });

  it('should use correct filename', () => {
    exportComparisonCsv(comparison);
    expect(lastDownload.filename).toBe('comparison-2026-01-to-2026-02.csv');
  });
});

// --- exportTrendsCsv ---

describe('exportTrendsCsv', () => {
  const snapshots = [
    {
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': { totalBugs: 10, byClassification: { regression: 3, usability: 4, 'general-engineering': 2, uncategorized: 1 } }
      }
    },
    {
      snapshotId: '2026-02',
      releases: {
        'rhoai-2.18': { totalBugs: 14, byClassification: { regression: 5, usability: 4, 'general-engineering': 3, uncategorized: 2 } }
      }
    }
  ];

  const velocityData = [
    { snapshotId: '2026-02', label: 'Feb 26', inflow: 6, outflow: 2, netChange: 4 }
  ];

  it('should produce correct headers', () => {
    exportTrendsCsv(snapshots, velocityData);
    expect(csvLines()[0]).toBe('Month,Release,Total Bugs,Regressions,Usability,General Engineering,Uncategorized,Inflow,Outflow,Net Change');
  });

  it('should produce one row per month-release pair', () => {
    exportTrendsCsv(snapshots, velocityData);
    const lines = csvLines();
    expect(lines.length).toBe(3); // 1 header + 2 data rows
  });

  it('should include velocity data for matching months', () => {
    exportTrendsCsv(snapshots, velocityData);
    const lines = csvLines();
    // Feb 2026 row should have velocity
    const febRow = lines.find(l => l.startsWith('2026-02'));
    expect(febRow).toContain(',6,2,4');
  });

  it('should leave velocity columns empty when no match', () => {
    exportTrendsCsv(snapshots, velocityData);
    const lines = csvLines();
    // Jan 2026 row has no velocity data
    const janRow = lines.find(l => l.startsWith('2026-01'));
    expect(janRow).toMatch(/,,,$/);
  });

  it('should default missing classification counts to 0', () => {
    const sparse = [{
      snapshotId: '2026-01',
      releases: {
        'rhoai-2.18': { totalBugs: 5, byClassification: { regression: 5 } }
      }
    }];
    exportTrendsCsv(sparse, []);
    const dataRow = csvLines()[1];
    // regression=5, usability=0, general-engineering=0, uncategorized=0
    expect(dataRow).toBe('2026-01,rhoai-2.18,5,5,0,0,0,,,');
  });

  it('should use correct filename', () => {
    exportTrendsCsv(snapshots, velocityData);
    expect(lastDownload.filename).toBe('trends-2026-01-to-2026-02.csv');
  });

  it('should handle empty snapshots array', () => {
    exportTrendsCsv([], []);
    expect(csvLines().length).toBe(1); // header only
    expect(lastDownload.filename).toBe('trends-unknown-to-unknown.csv');
  });
});
