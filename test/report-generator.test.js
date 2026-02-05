import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { ReportGenerator } from '../utils/ReportGenerator.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'a11y-report-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('CSV export neutralizes spreadsheet formula injection vectors', async () => {
  await withTempDir(async (dir) => {
    const report = {
      meta: {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        baseUrl: 'https://example.com',
        standard: 'WCAG2AA',
      },
      compliance: {
        level: 'A',
        score: 80,
        description: 'test',
      },
      results: [
        {
          url: 'https://example.com',
          startedAt: new Date().toISOString(),
          durationMs: 10,
          lhScore: 100,
          axeViolations: 0,
          pa11yIssues: 0,
          totalIssues: 1,
          unifiedIssues: [
            {
              id: 'issue-1',
              tool: 'axe',
              severity: 2,
              severityLabel: 'serious',
              message: '=2+2',
              selector: '+cmd',
              html: '@SUM(A1:A2)',
              url: 'https://example.com',
              wcagCriteria: [{ id: '1.1.1', level: 'A' }],
              helpUrl: '-unsafe',
            },
          ],
          errors: {},
        },
      ],
    };

    await ReportGenerator.generate(report, dir, ['csv'], 'security-check');

    const csv = await readFile(path.join(dir, 'security-check.csv'), 'utf8');
    const dataRow = csv.trim().split('\n')[1];

    assert.match(dataRow, /'=2\+2/);
    assert.match(dataRow, /'\+cmd/);
    assert.match(dataRow, /'@SUM\(A1:A2\)/);
    assert.match(dataRow, /'-unsafe/);
  });
});

test('CSV export includes code evidence columns when available', async () => {
  await withTempDir(async (dir) => {
    const report = {
      meta: {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        baseUrl: 'https://example.com',
        standard: 'WCAG2AA',
      },
      compliance: {
        level: 'A',
        score: 80,
        description: 'test',
      },
      results: [
        {
          url: 'https://example.com',
          startedAt: new Date().toISOString(),
          durationMs: 10,
          lhScore: 100,
          axeViolations: 0,
          pa11yIssues: 0,
          totalIssues: 1,
          unifiedIssues: [
            {
              id: 'issue-2',
              tool: 'axe',
              severity: 2,
              severityLabel: 'serious',
              message: 'Missing alt text',
              selector: 'img.hero',
              html: '<img class="hero">',
              url: 'https://example.com',
              wcagCriteria: [{ id: '1.1.1', level: 'A' }],
              helpUrl: 'https://example.com/help',
              evidence: {
                snippet: '<img class="hero">',
                source: 'dom-runtime',
                confidence: 'high',
                locator: {
                  selector: 'img.hero',
                  xpath: '/html[1]/body[1]/img[1]',
                  line: 8,
                  column: 5,
                },
              },
            },
          ],
          errors: {},
        },
      ],
    };

    await ReportGenerator.generate(report, dir, ['csv'], 'evidence-check');

    const csv = await readFile(path.join(dir, 'evidence-check.csv'), 'utf8');
    const [header, row] = csv.trim().split('\n');

    assert.match(header, /Evidence Snippet/);
    assert.match(header, /Evidence Source/);
    assert.match(header, /Evidence Confidence/);
    assert.match(row, /dom-runtime/);
    assert.match(row, /high/);
    assert.match(row, /\/html\[1\]\/body\[1\]\/img\[1\]/);
  });
});

test('CSV legacy mode omits evidence columns', async () => {
  await withTempDir(async (dir) => {
    const report = {
      meta: {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        baseUrl: 'https://example.com',
        standard: 'WCAG2AA',
      },
      compliance: {
        level: 'A',
        score: 80,
        description: 'test',
      },
      results: [
        {
          url: 'https://example.com',
          startedAt: new Date().toISOString(),
          durationMs: 10,
          lhScore: 100,
          axeViolations: 0,
          pa11yIssues: 0,
          totalIssues: 1,
          unifiedIssues: [
            {
              id: 'issue-3',
              tool: 'axe',
              severity: 2,
              severityLabel: 'serious',
              message: 'Missing alt text',
              selector: 'img.hero',
              html: '<img class="hero">',
              url: 'https://example.com',
              wcagCriteria: [{ id: '1.1.1', level: 'A' }],
              helpUrl: 'https://example.com/help',
              evidence: {
                snippet: '<img class="hero">',
                source: 'dom-runtime',
                confidence: 'high',
                locator: {
                  xpath: '/html[1]/body[1]/img[1]',
                  line: 8,
                  column: 5,
                },
              },
            },
          ],
          errors: {},
        },
      ],
    };

    await ReportGenerator.generate(report, dir, ['csv'], 'legacy-check', { csvLegacy: true });
    const csv = await readFile(path.join(dir, 'legacy-check.csv'), 'utf8');
    const [header] = csv.trim().split('\n');

    assert.doesNotMatch(header, /Evidence Snippet/);
    assert.doesNotMatch(header, /Evidence Source/);
    assert.doesNotMatch(header, /Evidence Confidence/);
  });
});
