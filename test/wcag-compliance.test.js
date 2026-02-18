import test from 'node:test';
import assert from 'node:assert/strict';

import { WCAGCompliance } from '../utils/WCAGCompliance.js';

const baseIssues = [
  {
    id: 'lighthouse-heading-order-0',
    tool: 'lighthouse',
    severity: 2,
    severityLabel: 'serious',
    message: 'Heading order issue',
    selector: 'main h3',
    url: 'https://example.com/about',
    wcagCriteria: [{ id: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'Perceivable' }],
    findingKind: 'violation',
    countsTowardCompliance: true,
  },
  {
    id: 'pa11y-bg-image-0',
    tool: 'pa11y',
    severity: 3,
    severityLabel: 'moderate',
    message: 'Contrast warning',
    selector: '.hero h1',
    url: 'https://example.com/about',
    wcagCriteria: [{ id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', principle: 'Perceivable' }],
    findingKind: 'manual-review',
    countsTowardCompliance: false,
  },
];

test('WCAGCompliance excludes manual-review findings by default', () => {
  const result = WCAGCompliance.calculate(baseIssues, 'WCAG2AA');

  assert.equal(result.summary.consideredTotal, 1);
  assert.equal(result.summary.reportedTotal, 2);
  assert.equal(result.summary.manualReview, 1);
  assert.equal(result.summary.inconclusive, 0);
  assert.equal(result.summary.promoted, 0);
  assert.equal(result.scoringPolicy.includeManualChecks, false);
  assert.equal(result.scoringPolicy.confidenceThreshold, 'high');
  assert.equal(result.wcagSummary.failedAA.length, 0);
  assert.equal(typeof result.confirmedScore, 'number');
  assert.equal(typeof result.reportedScore, 'number');
  assert.equal(result.confirmedScore > result.reportedScore, true);
});

test('WCAGCompliance can include manual-review findings when enabled', () => {
  const result = WCAGCompliance.calculate(baseIssues, 'WCAG2AA', { includeManualChecks: true });

  assert.equal(result.summary.consideredTotal, 2);
  assert.equal(result.summary.reportedTotal, 2);
  assert.equal(result.summary.manualReview, 1);
  assert.equal(result.scoringPolicy.includeManualChecks, true);
  assert.equal(result.wcagSummary.failedAA.length, 1);
  assert.equal(result.score, result.reportedScore);
});

test('WCAGCompliance collapses repeated cross-page instances for scoring', () => {
  const duplicateAcrossPages = [
    {
      id: 'p-home',
      tool: 'pa11y',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Ensure contrast ratio is at least 4.5:1',
      selector: '#primary-navigation > a',
      url: 'https://example.com/',
      wcagCriteria: [{ id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', principle: 'Perceivable' }],
      findingKind: 'violation',
      findingCertainty: 'promoted',
      countsTowardCompliance: true,
    },
    {
      id: 'p-about',
      tool: 'pa11y',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Ensure contrast ratio is at least 4.5:1',
      selector: '#primary-navigation > a',
      url: 'https://example.com/about',
      wcagCriteria: [{ id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', principle: 'Perceivable' }],
      findingKind: 'violation',
      findingCertainty: 'promoted',
      countsTowardCompliance: true,
    },
  ];

  const result = WCAGCompliance.calculate(duplicateAcrossPages, 'WCAG2AA');

  assert.equal(result.summary.rawConsideredTotal, 2);
  assert.equal(result.summary.consideredTotal, 1);
  assert.equal(result.summary.collapsedDuplicates, 1);
  assert.equal(result.sitewideRollup[0].occurrenceCount, 2);
  assert.equal(result.sitewideRollup[0].affectedPages.length, 2);
});
