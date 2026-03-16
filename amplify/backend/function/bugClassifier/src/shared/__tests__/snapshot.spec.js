import { describe, it, expect } from 'vitest';
import { rollupVersion, resolveVersions, isEaVersion, buildSnapshot } from '../snapshot.js';

describe('isEaVersion', () => {
  it('should return true for EA versions', () => {
    expect(isEaVersion('rhoai-3.4.EA1')).toBe(true);
    expect(isEaVersion('rhoai-3.4.EA2')).toBe(true);
  });

  it('should return false for non-EA versions', () => {
    expect(isEaVersion('rhoai-3.4')).toBe(false);
    expect(isEaVersion('rhoai-3.3.1')).toBe(false);
    expect(isEaVersion('rhoai-2.25.next')).toBe(false);
    expect(isEaVersion('RHAIIS-1.1')).toBe(false);
  });
});

describe('rollupVersion', () => {
  it('should return x.y for standard rhoai versions', () => {
    expect(rollupVersion('rhoai-3.4')).toBe('rhoai-3.4');
    expect(rollupVersion('rhoai-2.25')).toBe('rhoai-2.25');
  });

  it('should strip z-stream suffixes', () => {
    expect(rollupVersion('rhoai-3.3.1')).toBe('rhoai-3.3');
    expect(rollupVersion('rhoai-2.25.2')).toBe('rhoai-2.25');
  });

  it('should strip EA suffixes', () => {
    expect(rollupVersion('rhoai-3.4.EA1')).toBe('rhoai-3.4');
    expect(rollupVersion('rhoai-3.4.EA2')).toBe('rhoai-3.4');
  });

  it('should strip .next suffixes', () => {
    expect(rollupVersion('rhoai-2.25.next')).toBe('rhoai-2.25');
    expect(rollupVersion('rhoai-2.16.next')).toBe('rhoai-2.16');
  });

  it('should return null for non-rhoai prefixes', () => {
    expect(rollupVersion('RHAIIS-1.1')).toBeNull();
    expect(rollupVersion('other-2.0')).toBeNull();
  });

  it('should group versions before 2.16 as Pre-2.16', () => {
    expect(rollupVersion('rhoai-2.15')).toBe('Pre-2.16');
    expect(rollupVersion('rhoai-2.10.2')).toBe('Pre-2.16');
    expect(rollupVersion('rhoai-2.8.5')).toBe('Pre-2.16');
    expect(rollupVersion('rhoai-1.0')).toBe('Pre-2.16');
  });

  it('should not group 2.16 and above as Pre-2.16', () => {
    expect(rollupVersion('rhoai-2.16')).toBe('rhoai-2.16');
    expect(rollupVersion('rhoai-2.16.1')).toBe('rhoai-2.16');
    expect(rollupVersion('rhoai-3.0')).toBe('rhoai-3.0');
  });
});

describe('resolveVersions', () => {
  it('should use affectsVersions as primary', () => {
    const bug = {
      affectsVersions: ['rhoai-3.3'],
      fixVersions: ['rhoai-3.3.1'],
    };
    expect(resolveVersions(bug)).toEqual(['rhoai-3.3']);
  });

  it('should fall back to fixVersions when affectsVersions is empty', () => {
    const bug = {
      affectsVersions: [],
      fixVersions: ['rhoai-3.3.1'],
    };
    expect(resolveVersions(bug)).toEqual(['rhoai-3.3']);
  });

  it('should return Unversioned when both are empty', () => {
    const bug = { affectsVersions: [], fixVersions: [] };
    expect(resolveVersions(bug)).toEqual(['Unversioned']);
  });

  it('should return Unversioned when fields are undefined', () => {
    const bug = {};
    expect(resolveVersions(bug)).toEqual(['Unversioned']);
  });

  it('should return multiple releases for multi-version bugs', () => {
    const bug = {
      affectsVersions: ['rhoai-3.3', 'rhoai-3.4'],
      fixVersions: [],
    };
    const result = resolveVersions(bug);
    expect(result).toContain('rhoai-3.3');
    expect(result).toContain('rhoai-3.4');
    expect(result).toHaveLength(2);
  });

  it('should deduplicate when z-stream versions roll up to the same release', () => {
    const bug = {
      affectsVersions: ['rhoai-3.3', 'rhoai-3.3.1'],
      fixVersions: [],
    };
    expect(resolveVersions(bug)).toEqual(['rhoai-3.3']);
  });

  it('should exclude non-rhoai versions and return Unversioned if none remain', () => {
    const bug = {
      affectsVersions: ['RHAIIS-1.1'],
      fixVersions: [],
    };
    expect(resolveVersions(bug)).toEqual(['Unversioned']);
  });

  it('should exclude non-rhoai versions but keep valid rhoai versions', () => {
    const bug = {
      affectsVersions: ['RHAIIS-1.1', 'rhoai-3.4'],
      fixVersions: [],
    };
    expect(resolveVersions(bug)).toEqual(['rhoai-3.4']);
  });
});

describe('buildSnapshot', () => {
  const makeBug = (overrides) => ({
    key: 'RHOAIENG-1',
    summary: 'Test bug',
    priority: 'Major',
    status: 'New',
    team: 'Dashboard',
    classification: 'regression',
    created: '2026-01-15T10:00:00Z',
    updated: '2026-02-20T14:00:00Z',
    affectsVersions: [],
    fixVersions: [],
    ...overrides,
  });

  it('should build a valid snapshot document', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'] }),
      makeBug({ key: 'RHOAIENG-2', affectsVersions: ['rhoai-3.3'], classification: 'usability' }),
      makeBug({ key: 'RHOAIENG-3' }), // unversioned
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.snapshotId).toBe('2026-03');
    expect(snapshot.projectKey).toBe('RHOAIENG');
    expect(snapshot.totalBugs).toBe(3);
    expect(snapshot.versionedBugs).toBe(2);
    expect(snapshot.unversionedBugs).toBe(1);
    expect(snapshot.generatedAt).toBeTruthy();
    expect(snapshot.snapshotDate).toBe('2026-03-01T00:00:00Z');
  });

  it('should group bugs by release', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'] }),
      makeBug({ key: 'RHOAIENG-2', affectsVersions: ['rhoai-3.4'], classification: 'usability' }),
      makeBug({ key: 'RHOAIENG-3', affectsVersions: ['rhoai-3.3'] }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['rhoai-3.4'].totalBugs).toBe(2);
    expect(snapshot.releases['rhoai-3.4'].bugKeys).toEqual(['RHOAIENG-1', 'RHOAIENG-2']);
    expect(snapshot.releases['rhoai-3.3'].totalBugs).toBe(1);
  });

  it('should count multi-version bugs in each release', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.3', 'rhoai-3.4'] })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['rhoai-3.3'].totalBugs).toBe(1);
    expect(snapshot.releases['rhoai-3.4'].totalBugs).toBe(1);
    expect(snapshot.totalBugs).toBe(1); // global count is 1
  });

  it('should create Unversioned release group', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1' }), makeBug({ key: 'RHOAIENG-2' })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['Unversioned'].totalBugs).toBe(2);
    expect(snapshot.releases['Unversioned'].bugKeys).toEqual(['RHOAIENG-1', 'RHOAIENG-2']);
  });

  it('should create Pre-2.16 release group for old versions', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-2.10.2'] })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['Pre-2.16'].totalBugs).toBe(1);
    expect(snapshot.versionedBugs).toBe(1);
  });

  it('should track EA bugs with eaBugs count', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4.EA1'] }),
      makeBug({ key: 'RHOAIENG-2', affectsVersions: ['rhoai-3.4.EA2'] }),
      makeBug({ key: 'RHOAIENG-3', affectsVersions: ['rhoai-3.4'] }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['rhoai-3.4'].totalBugs).toBe(3);
    expect(snapshot.releases['rhoai-3.4'].eaBugs).toBe(2);
  });

  it('should not include eaBugs field when there are no EA bugs', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.3'] })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['rhoai-3.3'].eaBugs).toBeUndefined();
  });

  it('should exclude RHAIIS versions entirely', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1', affectsVersions: ['RHAIIS-1.1'] })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.releases['RHAIIS-1.1']).toBeUndefined();
    expect(snapshot.releases['Unversioned'].totalBugs).toBe(1);
  });

  it('should compute data quality percentages', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'], fixVersions: ['rhoai-3.4.1'] }),
      makeBug({ key: 'RHOAIENG-2', affectsVersions: ['rhoai-3.3'] }),
      makeBug({ key: 'RHOAIENG-3' }),
      makeBug({ key: 'RHOAIENG-4', fixVersions: ['rhoai-3.4'] }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.dataQuality.pctWithAffectsVersion).toBe(50); // 2 of 4
    expect(snapshot.dataQuality.pctWithFixVersion).toBe(50); // 2 of 4
    expect(snapshot.dataQuality.pctWithVersion).toBe(75); // 3 of 4 have a valid version
  });

  it('should store per-bug details in release groups', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'], summary: 'Test bug summary' }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');
    const bugDetail = snapshot.releases['rhoai-3.4'].bugs[0];

    expect(bugDetail.key).toBe('RHOAIENG-1');
    expect(bugDetail.classification).toBe('regression');
    expect(bugDetail.priority).toBe('Major');
    expect(bugDetail.status).toBe('New');
    expect(bugDetail.team).toBe('Dashboard');
    expect(bugDetail.summary).toBe('Test bug summary');
    expect(bugDetail.created).toBe('2026-01-15T10:00:00Z');
    expect(bugDetail.updated).toBe('2026-02-20T14:00:00Z');
    // Should not include full bug fields like description, labels, etc.
    expect(bugDetail.description).toBeUndefined();
    expect(bugDetail.labels).toBeUndefined();
  });

  it('should compute global aggregates', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', classification: 'regression', priority: 'Critical' }),
      makeBug({ key: 'RHOAIENG-2', classification: 'regression', priority: 'Major' }),
      makeBug({ key: 'RHOAIENG-3', classification: 'usability', priority: 'Major' }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.global.byClassification.regression).toBe(2);
    expect(snapshot.global.byClassification.usability).toBe(1);
    expect(snapshot.global.byPriority.Critical).toBe(1);
    expect(snapshot.global.byPriority.Major).toBe(2);
  });

  it('should handle empty bug array', () => {
    const snapshot = buildSnapshot([], 'RHOAIENG', '2026-03');

    expect(snapshot.totalBugs).toBe(0);
    expect(snapshot.versionedBugs).toBe(0);
    expect(snapshot.unversionedBugs).toBe(0);
    expect(snapshot.releases).toEqual({});
    expect(snapshot.dataQuality.pctWithVersion).toBe(0);
  });

  it('should not count resolved bugs in totalBugs or aggregates', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'] }),
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        isResolved: true,
        resolved: '2026-03-15T10:00:00Z',
        resolution: 'Done',
      }),
      makeBug({
        key: 'RHOAIENG-3',
        affectsVersions: ['rhoai-3.4'],
        isResolved: true,
        resolved: '2026-03-20T10:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.totalBugs).toBe(1); // only open bug
    expect(snapshot.releases['rhoai-3.4'].totalBugs).toBe(1);
    expect(snapshot.releases['rhoai-3.4'].bugKeys).toEqual(['RHOAIENG-1']);
    expect(snapshot.global.byClassification.regression).toBe(1);
  });

  it('should include resolved bugs in the bugs array with isResolved flag', () => {
    const bugs = [
      makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'] }),
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        isResolved: true,
        resolved: '2026-03-15T10:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    const bugsArray = snapshot.releases['rhoai-3.4'].bugs;
    expect(bugsArray).toHaveLength(2);
    expect(bugsArray.find((b) => b.key === 'RHOAIENG-1').isResolved).toBeUndefined();
    expect(bugsArray.find((b) => b.key === 'RHOAIENG-2').isResolved).toBe(true);
    expect(bugsArray.find((b) => b.key === 'RHOAIENG-2').resolved).toBe('2026-03-15T10:00:00Z');
  });

  it('should compute velocity section when resolved bugs are present', () => {
    const bugs = [
      makeBug({
        key: 'RHOAIENG-1',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-05T10:00:00Z',
      }),
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-10T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-20T10:00:00Z',
        resolution: 'Done',
      }),
      makeBug({
        key: 'RHOAIENG-3',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-02-01T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-12T10:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.velocity).toBeDefined();
    expect(snapshot.velocity.openBugs).toBe(1);
    expect(snapshot.velocity.createdInPeriod).toBe(2); // RHOAIENG-1 and RHOAIENG-2 created in March
    expect(snapshot.velocity.resolvedInPeriod).toBe(2); // both resolved in March
  });

  it('should not include velocity section when no resolved bugs exist', () => {
    const bugs = [makeBug({ key: 'RHOAIENG-1', affectsVersions: ['rhoai-3.4'] })];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.velocity).toBeUndefined();
  });

  it('should compute time-to-resolve buckets', () => {
    const bugs = [
      // Resolved in 3 days (< 1 week)
      makeBug({
        key: 'RHOAIENG-1',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-01T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-04T10:00:00Z',
        resolution: 'Done',
      }),
      // Resolved in 10 days (1-2 weeks)
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-01T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-11T10:00:00Z',
        resolution: 'Done',
      }),
      // Resolved in 25 days (2-4 weeks)
      makeBug({
        key: 'RHOAIENG-3',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-01T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-26T10:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.velocity.timeToResolveBuckets['< 1 week']).toBe(1);
    expect(snapshot.velocity.timeToResolveBuckets['1-2 weeks']).toBe(1);
    expect(snapshot.velocity.timeToResolveBuckets['2-4 weeks']).toBe(1);
    expect(snapshot.velocity.timeToResolveBuckets['1-3 months']).toBe(0);
    expect(snapshot.velocity.timeToResolveBuckets['3+ months']).toBe(0);
  });

  it('should compute average time-to-resolve', () => {
    const bugs = [
      // 5 days
      makeBug({
        key: 'RHOAIENG-1',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-01T00:00:00Z',
        isResolved: true,
        resolved: '2026-03-06T00:00:00Z',
        resolution: 'Done',
      }),
      // 15 days
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-01T00:00:00Z',
        isResolved: true,
        resolved: '2026-03-16T00:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.velocity.avgTimeToResolveDays).toBe(10); // (5 + 15) / 2
  });

  it('should only count bugs resolved within the snapshot period for velocity', () => {
    const bugs = [
      // Created in March, resolved in March — counts for both createdInPeriod and resolvedInPeriod
      makeBug({
        key: 'RHOAIENG-1',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-03-05T10:00:00Z',
        isResolved: true,
        resolved: '2026-03-20T10:00:00Z',
        resolution: 'Done',
      }),
      // Created in Feb, resolved in Feb — does NOT count for March velocity
      makeBug({
        key: 'RHOAIENG-2',
        affectsVersions: ['rhoai-3.4'],
        created: '2026-02-01T10:00:00Z',
        isResolved: true,
        resolved: '2026-02-15T10:00:00Z',
        resolution: 'Done',
      }),
    ];

    const snapshot = buildSnapshot(bugs, 'RHOAIENG', '2026-03');

    expect(snapshot.velocity.createdInPeriod).toBe(1);
    expect(snapshot.velocity.resolvedInPeriod).toBe(1);
  });
});
