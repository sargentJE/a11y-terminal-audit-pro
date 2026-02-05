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
