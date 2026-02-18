import test from 'node:test';
import assert from 'node:assert/strict';

import { deduplicateIssues } from '../services/audit/dedupe/issueDedupe.js';

test('deduplicateIssues merges same-page cross-tool issues by xpath', () => {
  const issues = [
    {
      id: 'axe-heading-order-0',
      tool: 'axe',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Ensure heading order is correct',
      selector: '.card:nth-child(1) > h3',
      url: 'https://example.com/about',
      wcagCriteria: [{ id: '1.3.1', name: 'Info and Relationships', level: 'A' }],
      evidence: { locator: { xpath: '/html/body/main/section/article[1]/h3', line: 42, column: 10 } },
      findingKind: 'violation',
      countsTowardCompliance: true,
    },
    {
      id: 'lighthouse-heading-order-0',
      tool: 'lighthouse',
      severity: 2,
      severityLabel: 'serious',
      message: 'Heading elements are not in a sequentially-descending order',
      selector: 'main > section > article > h3',
      url: 'https://example.com/about',
      wcagCriteria: [{ id: '1.3.1', name: 'Info and Relationships', level: 'A' }],
      evidence: { locator: { xpath: '/html/body/main/section/article[1]/h3', line: 42, column: 10 } },
      findingKind: 'violation',
      countsTowardCompliance: true,
    },
  ];

  const deduped = deduplicateIssues(issues);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].severityLabel, 'serious');
  assert.equal(deduped[0].findingCertainty, 'confirmed');
  assert.deepEqual(deduped[0].corroboratedBy.sort(), ['axe', 'lighthouse']);
  assert.deepEqual(deduped[0].mergedFrom.sort(), ['axe-heading-order-0', 'lighthouse-heading-order-0']);
});

test('deduplicateIssues does not merge different locations on the same page', () => {
  const issues = [
    {
      id: 'p1',
      tool: 'pa11y',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Contrast warning',
      selector: '.hero h1',
      url: 'https://example.com/about',
      wcagCriteria: [{ id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA' }],
      evidence: { locator: { xpath: '/html/body/main/h1', line: 10, column: 2 } },
      findingKind: 'manual-review',
      countsTowardCompliance: false,
    },
    {
      id: 'p2',
      tool: 'pa11y',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Contrast warning',
      selector: '.hero p',
      url: 'https://example.com/about',
      wcagCriteria: [{ id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA' }],
      evidence: { locator: { xpath: '/html/body/main/p', line: 11, column: 2 } },
      findingKind: 'manual-review',
      countsTowardCompliance: false,
    },
  ];

  const deduped = deduplicateIssues(issues);

  assert.equal(deduped.length, 2);
  assert.equal(deduped.every((issue) => issue.findingCertainty === 'manual-review'), true);
});
