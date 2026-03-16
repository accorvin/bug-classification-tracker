import { describe, it, expect } from 'vitest';
import { compareSnapshots } from '../utils/snapshot-compare';

const makeSnapshot = (overrides) => ({
  snapshotId: '2026-01',
  totalBugs: 100,
  global: {
    byClassification: {
      regression: 20,
      usability: 30,
      'general-engineering': 40,
      uncategorized: 10,
    },
    byPriority: { Critical: 10, Major: 50, Minor: 40 },
    byStatus: { New: 60, 'In Progress': 20, Backlog: 20 },
  },
  releases: {},
  ...overrides,
});

describe('compareSnapshots', () => {
  it('should compute global totalBugs delta', () => {
    const from = makeSnapshot({ snapshotId: '2026-01', totalBugs: 100 });
    const to = makeSnapshot({ snapshotId: '2026-02', totalBugs: 112 });

    const result = compareSnapshots(from, to);

    expect(result.from).toBe('2026-01');
    expect(result.to).toBe('2026-02');
    expect(result.global.totalBugsDelta).toBe(12);
  });

  it('should compute classification deltas', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      global: { byClassification: { regression: 20, usability: 30 }, byPriority: {}, byStatus: {} },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      global: { byClassification: { regression: 25, usability: 28 }, byPriority: {}, byStatus: {} },
    });

    const result = compareSnapshots(from, to);

    expect(result.global.byClassification.regression).toEqual({ from: 20, to: 25, delta: 5 });
    expect(result.global.byClassification.usability).toEqual({ from: 30, to: 28, delta: -2 });
  });

  it('should handle new categories appearing in the to snapshot', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      global: { byClassification: { regression: 20 }, byPriority: {}, byStatus: {} },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      global: { byClassification: { regression: 25, usability: 10 }, byPriority: {}, byStatus: {} },
    });

    const result = compareSnapshots(from, to);

    expect(result.global.byClassification.usability).toEqual({ from: 0, to: 10, delta: 10 });
  });

  it('should compute per-release deltas with inflow/outflow', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      releases: {
        'rhoai-3.4': {
          totalBugs: 10,
          bugKeys: ['A', 'B', 'C', 'D'],
          byClassification: { regression: 5, usability: 5 },
        },
      },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      releases: {
        'rhoai-3.4': {
          totalBugs: 12,
          bugKeys: ['B', 'C', 'D', 'E', 'F', 'G'],
          byClassification: { regression: 7, usability: 5 },
        },
      },
    });

    const result = compareSnapshots(from, to);

    expect(result.releases['rhoai-3.4'].totalBugsDelta).toBe(2);
    expect(result.releases['rhoai-3.4'].newBugKeys).toEqual(['E', 'F', 'G']);
    expect(result.releases['rhoai-3.4'].resolvedBugKeys).toEqual(['A']);
    expect(result.releases['rhoai-3.4'].inflow).toBe(3);
    expect(result.releases['rhoai-3.4'].outflow).toBe(1);
  });

  it('should handle releases appearing only in one snapshot', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      releases: {
        'rhoai-3.3': { totalBugs: 5, bugKeys: ['A'], byClassification: { regression: 5 } },
      },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      releases: {
        'rhoai-3.4': { totalBugs: 3, bugKeys: ['B'], byClassification: { usability: 3 } },
      },
    });

    const result = compareSnapshots(from, to);

    expect(result.releases['rhoai-3.3'].totalBugsDelta).toBe(-5);
    expect(result.releases['rhoai-3.3'].outflow).toBe(1);
    expect(result.releases['rhoai-3.4'].totalBugsDelta).toBe(3);
    expect(result.releases['rhoai-3.4'].inflow).toBe(1);
  });

  it('should compute velocity from bugKeys diffs (Stage 1)', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      totalBugs: 100,
      releases: {
        'rhoai-3.4': { totalBugs: 10, bugKeys: ['A', 'B', 'C'], byClassification: {} },
      },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      totalBugs: 110,
      releases: {
        'rhoai-3.4': { totalBugs: 15, bugKeys: ['B', 'C', 'D', 'E', 'F'], byClassification: {} },
      },
    });

    const result = compareSnapshots(from, to);

    expect(result.velocity.netChange).toBe(10);
    expect(result.velocity.inflow).toBe(3); // D, E, F
    expect(result.velocity.outflow).toBe(1); // A
  });

  it('should use precise velocity when both snapshots have velocity data (Stage 2)', () => {
    const from = makeSnapshot({
      snapshotId: '2026-01',
      totalBugs: 100,
      velocity: { openBugs: 100, createdInPeriod: 40, resolvedInPeriod: 35 },
    });
    const to = makeSnapshot({
      snapshotId: '2026-02',
      totalBugs: 110,
      velocity: { openBugs: 110, createdInPeriod: 50, resolvedInPeriod: 30 },
    });

    const result = compareSnapshots(from, to);

    expect(result.velocity.netChange).toBe(10);
    expect(result.velocity.inflow).toBe(50);
    expect(result.velocity.outflow).toBe(30);
  });
});
