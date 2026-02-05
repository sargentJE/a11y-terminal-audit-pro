import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { ReportGenerator } from '../utils/ReportGenerator.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'a11y-report-contracts-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('report generators preserve JSON/HTML/SARIF high-level contract', async () => {
  await withTempDir(async (dir) => {
    const report = {
      meta: {
        tool: 'a11y-terminal-audit-pro',
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        baseUrl: 'https://example.com',
        standard: 'WCAG2AA',
        limit: 5,
        timeoutMs: 60000,
        report: { csvLegacy: false },
      },
      compliance: {
        level: 'AA',
        score: 88,
        description: 'Site meets WCAG 2.2 Level AA',
        summary: {
          critical: 0,
          serious: 1,
          moderate: 0,
          minor: 0,
          total: 1,
        },
        wcagSummary: {
          failedA: [],
          failedAA: ['1.4.3: Contrast (Minimum)'],
          failedAAA: [],
        },
      },
      results: [
        {
          url: 'https://example.com',
          startedAt: new Date().toISOString(),
          durationMs: 1200,
          lhScore: 91,
          axeViolations: 1,
          pa11yIssues: 0,
          totalIssues: 1,
          unifiedIssues: [
            {
              id: 'axe-color-contrast-0',
              stableFingerprint: 'abc123def456abc123def456',
              tool: 'axe',
              severity: 2,
              severityLabel: 'serious',
              message: 'Elements must meet minimum color contrast ratio thresholds',
              selector: '.cta',
              html: '<a class="cta">Read More</a>',
              url: 'https://example.com',
              wcagCriteria: [{ id: '1.4.3', level: 'AA', name: 'Contrast (Minimum)' }],
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.11/color-contrast',
              evidence: {
                snippet: '<a class="cta">Read More</a>',
                source: 'dom-runtime',
                confidence: 'high',
                locator: {
                  line: 12,
                  column: 8,
                  xpath: '/html[1]/body[1]/a[1]',
                },
              },
            },
          ],
          errors: {},
        },
      ],
    };

    await ReportGenerator.generate(report, dir, ['json', 'html', 'sarif'], 'contract-check');

    const jsonPath = path.join(dir, 'contract-check.json');
    const htmlPath = path.join(dir, 'contract-check.html');
    const sarifPath = path.join(dir, 'contract-check.sarif');

    const jsonData = JSON.parse(await readFile(jsonPath, 'utf8'));
    const htmlData = await readFile(htmlPath, 'utf8');
    const sarifData = JSON.parse(await readFile(sarifPath, 'utf8'));

    assert.equal(jsonData.meta.tool, 'a11y-terminal-audit-pro');
    assert.equal(Array.isArray(jsonData.results), true);
    assert.equal(jsonData.results[0].unifiedIssues[0].stableFingerprint, 'abc123def456abc123def456');

    assert.match(htmlData, /All Issues/);
    assert.match(htmlData, /By Page/);
    assert.match(htmlData, /By WCAG Criteria/);
    assert.match(htmlData, /function showTab\(event, tabId\)/);

    assert.equal(sarifData.version, '2.1.0');
    assert.equal(sarifData.runs[0].tool.driver.name, 'A11Y Terminal Audit Pro');
    assert.equal(sarifData.runs[0].results[0].locations[0].physicalLocation.region.startLine, 12);
    assert.equal(
      sarifData.runs[0].results[0].locations[0].physicalLocation.region.startColumn,
      8
    );
  });
});
