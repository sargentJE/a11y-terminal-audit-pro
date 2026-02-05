import test from 'node:test';
import assert from 'node:assert/strict';

import { collectUnifiedIssues, orderReportResults } from '../cli/orderResults.js';

test('orderReportResults follows route discovery order', () => {
  const routes = ['https://example.com/', 'https://example.com/about', 'https://example.com/contact'];
  const report = [
    { url: 'https://example.com/contact', unifiedIssues: [{ id: 'c-1' }] },
    { url: 'https://example.com/', unifiedIssues: [{ id: 'h-1' }] },
    { url: 'https://example.com/about', unifiedIssues: [{ id: 'a-1' }] },
  ];

  const ordered = orderReportResults(report, routes);
  assert.deepEqual(
    ordered.map((r) => r.url),
    routes
  );
});

test('collectUnifiedIssues flattens route issue arrays in order', () => {
  const report = [
    { url: 'https://example.com/', unifiedIssues: [{ id: '1' }, { id: '2' }] },
    { url: 'https://example.com/about', unifiedIssues: [{ id: '3' }] },
  ];

  const issues = collectUnifiedIssues(report);
  assert.deepEqual(
    issues.map((i) => i.id),
    ['1', '2', '3']
  );
});
