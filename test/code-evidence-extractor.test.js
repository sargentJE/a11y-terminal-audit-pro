import test from 'node:test';
import assert from 'node:assert/strict';

import { CodeEvidenceExtractor } from '../utils/CodeEvidenceExtractor.js';

test('CodeEvidenceExtractor prefers runtime DOM evidence with high confidence', async () => {
  const issues = [
    {
      id: 'axe-link-name-0',
      tool: 'axe',
      severity: 2,
      severityLabel: 'serious',
      message: 'Links must have discernible text',
      selector: '#cta',
      html: '<a id="cta">Buy now</a>',
      url: 'https://example.com',
      wcagCriteria: [],
    },
  ];

  const page = {
    evaluate: async (_fn, selector) => {
      if (selector === '#cta') {
        return {
          found: true,
          snippet: '<a id="cta" data-token="abc123">Buy now</a>',
          xpath: '/html[1]/body[1]/a[1]',
        };
      }
      return { found: false };
    },
    content: async () => '<html>\n<body>\n<a id="cta" data-token="abc123">Buy now</a>\n</body>\n</html>',
  };

  const enriched = await CodeEvidenceExtractor.enrichIssues(issues, {
    page,
    options: { maxChars: 1000 },
  });

  assert.equal(enriched[0].evidence.source, 'dom-runtime');
  assert.equal(enriched[0].evidence.confidence, 'high');
  assert.equal(enriched[0].evidence.locator.selector, '#cta');
  assert.equal(enriched[0].evidence.locator.xpath, '/html[1]/body[1]/a[1]');
  assert.match(enriched[0].evidence.snippet, /\[REDACTED\]/);
});

test('CodeEvidenceExtractor falls back to response source matching when selector lookup fails', async () => {
  const issues = [
    {
      id: 'pa11y-1',
      tool: 'pa11y',
      severity: 3,
      severityLabel: 'moderate',
      message: 'Element has low contrast',
      selector: '.missing',
      html: '<button class="buy-now">Buy now</button>',
      url: 'https://example.com',
      wcagCriteria: [],
    },
  ];

  const page = {
    evaluate: async () => ({ found: false }),
    content: async () => '<html>\n<body>\n<div>other</div>\n<button class="buy-now">Buy now</button>\n</body>\n</html>',
  };

  const enriched = await CodeEvidenceExtractor.enrichIssues(issues, {
    page,
    options: { contextLines: 1 },
  });

  assert.equal(enriched[0].evidence.source, 'response-source');
  assert.equal(enriched[0].evidence.confidence, 'medium');
  assert.equal(typeof enriched[0].evidence.locator.line, 'number');
  assert.ok(enriched[0].evidence.locator.line > 0);
});

test('CodeEvidenceExtractor degrades gracefully to tool context evidence', async () => {
  const issues = [
    {
      id: 'lighthouse-1',
      tool: 'lighthouse',
      severity: 4,
      severityLabel: 'minor',
      message: 'Document has no title',
      selector: 'main >>> invalid',
      html: '',
      url: 'https://example.com',
      wcagCriteria: [],
    },
  ];

  const page = {
    evaluate: async () => ({ found: false, error: 'Failed to execute querySelector' }),
    content: async () => '',
  };

  const enriched = await CodeEvidenceExtractor.enrichIssues(issues, { page });

  assert.equal(enriched[0].evidence.source, 'tool-context');
  assert.equal(enriched[0].evidence.confidence, 'low');
  assert.match(enriched[0].evidence.captureError, /Selector lookup failed/);
});

test('CodeEvidenceExtractor redacts query, bearer, and unquoted secret patterns', async () => {
  const issues = [
    {
      id: 'axe-secret-check-0',
      tool: 'axe',
      severity: 2,
      severityLabel: 'serious',
      message: 'Sensitive values should not leak',
      selector: '#secure',
      html: '',
      url: 'https://example.com',
      wcagCriteria: [],
    },
  ];

  const page = {
    evaluate: async () => ({
      found: true,
      snippet: '<a id=secure href="/?access_token=abc123&jwt=xyz987" authorization=BearerToken password=topsecret>Link</a>',
      xpath: '/html[1]/body[1]/a[1]',
    }),
    content: async () => '<html><body><a id=secure href="/?access_token=abc123&jwt=xyz987">Link</a></body></html>',
  };

  const enriched = await CodeEvidenceExtractor.enrichIssues(issues, { page });
  const snippet = enriched[0].evidence.snippet;

  assert.doesNotMatch(snippet, /abc123/);
  assert.doesNotMatch(snippet, /xyz987/);
  assert.doesNotMatch(snippet, /topsecret/i);
  assert.match(snippet, /\[REDACTED\]/);
});

test('CodeEvidenceExtractor provides extraction summary telemetry', async () => {
  const issues = [
    {
      id: 'axe-1',
      tool: 'axe',
      severity: 2,
      severityLabel: 'serious',
      message: 'Issue one',
      selector: '#known',
      html: '<div id="known"></div>',
      url: 'https://example.com',
      wcagCriteria: [],
    },
    {
      id: 'axe-2',
      tool: 'axe',
      severity: 2,
      severityLabel: 'serious',
      message: 'Issue two',
      selector: '#missing',
      html: '',
      url: 'https://example.com',
      wcagCriteria: [],
    },
  ];

  const page = {
    evaluate: async (_fn, selector) => {
      if (selector === '#known') {
        return { found: true, snippet: '<div id="known"></div>', xpath: '/html[1]/body[1]/div[1]' };
      }
      return { found: false };
    },
    content: async () => '<html><body><div id="known"></div></body></html>',
  };

  const { issues: enriched, summary } = await CodeEvidenceExtractor.enrichIssuesWithSummary(issues, { page });

  assert.equal(enriched.length, 2);
  assert.equal(summary.enabled, true);
  assert.equal(summary.totalIssues, 2);
  assert.equal(summary.high, 1);
  assert.equal(summary.low, 1);
  assert.equal(summary.unresolved, 1);
  assert.ok(summary.extractionMs >= 0);
});
