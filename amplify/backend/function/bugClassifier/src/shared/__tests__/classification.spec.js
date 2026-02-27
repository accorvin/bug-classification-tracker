import { describe, it, expect, vi } from 'vitest';
import { classifyWithRules, buildSummary, needsReclassification, CATEGORIES } from '../classification.js';

describe('classifyWithRules', () => {
  it('should classify as regression when label contains "regression"', () => {
    const bug = {
      summary: 'Test bug',
      description: 'Test description',
      labels: ['bug', 'Regression'],
      component: 'API',
      team: 'Backend'
    };

    const result = classifyWithRules(bug);
    expect(result).toBeTruthy();
    expect(result.classification).toBe(CATEGORIES.REGRESSION);
    expect(result.classificationMethod).toBe('rule');
    expect(result.classificationReason).toContain('Regression');
  });

  it('should classify as regression when summary contains "regression"', () => {
    const bug = {
      summary: 'This is a regression in the login flow',
      description: 'Test description',
      labels: [],
      component: 'API'
    };

    const result = classifyWithRules(bug);
    expect(result).toBeTruthy();
    expect(result.classification).toBe(CATEGORIES.REGRESSION);
    expect(result.classificationMethod).toBe('rule');
  });

  it('should classify as usability when label contains "usability"', () => {
    const bug = {
      summary: 'Test bug',
      description: 'Test description',
      labels: ['bug', 'usability'],
      component: 'API'
    };

    const result = classifyWithRules(bug);
    expect(result).toBeTruthy();
    expect(result.classification).toBe(CATEGORIES.USABILITY);
    expect(result.classificationMethod).toBe('rule');
  });

  it('should classify as usability when component contains "UI"', () => {
    const bug = {
      summary: 'Test bug',
      description: 'Test description',
      labels: [],
      component: 'UXD'
    };

    const result = classifyWithRules(bug);
    expect(result).toBeTruthy();
    expect(result.classification).toBe(CATEGORIES.USABILITY);
    expect(result.classificationReason).toContain('UXD');
  });

  it('should return null when no rule matches', () => {
    const bug = {
      summary: 'Some random bug',
      description: 'Some description',
      labels: [],
      component: 'API'
    };

    const result = classifyWithRules(bug);
    expect(result).toBeNull();
  });
});

describe('buildSummary', () => {
  it('should build correct summary statistics', () => {
    const bugs = [
      { classification: 'regression', priority: 'High', team: 'Team A', severity: 'Urgent' },
      { classification: 'regression', priority: 'Medium', team: 'Team A', severity: 'High' },
      { classification: 'usability', priority: 'High', team: 'Team B', severity: 'Medium' },
      { classification: 'general-engineering', priority: 'Low', team: 'Team B', severity: 'Low' }
    ];

    const summary = buildSummary(bugs);

    expect(summary.totalBugs).toBe(4);
    expect(summary.byClassification.regression.count).toBe(2);
    expect(summary.byClassification.usability.count).toBe(1);
    expect(summary.byClassification['general-engineering'].count).toBe(1);
    expect(summary.byPriority.High).toBe(2);
    expect(summary.byTeam['Team A']).toBe(2);
  });

  it('should handle empty bug list', () => {
    const summary = buildSummary([]);

    expect(summary.totalBugs).toBe(0);
    expect(summary.byClassification.regression.count).toBe(0);
  });
});

describe('needsReclassification', () => {
  it('should return true when bug was updated after classification', () => {
    const bug = {
      key: 'BUG-1',
      updated: '2026-02-26T12:00:00Z'
    };

    const classifiedBug = {
      key: 'BUG-1',
      classifiedAt: '2026-02-26T10:00:00Z'
    };

    expect(needsReclassification(bug, classifiedBug)).toBe(true);
  });

  it('should return false when bug was not updated after classification', () => {
    const bug = {
      key: 'BUG-1',
      updated: '2026-02-26T10:00:00Z'
    };

    const classifiedBug = {
      key: 'BUG-1',
      classifiedAt: '2026-02-26T12:00:00Z'
    };

    expect(needsReclassification(bug, classifiedBug)).toBe(false);
  });

  it('should return true when no previous classification exists', () => {
    const bug = {
      key: 'BUG-1',
      updated: '2026-02-26T12:00:00Z'
    };

    expect(needsReclassification(bug, null)).toBe(true);
  });
});
