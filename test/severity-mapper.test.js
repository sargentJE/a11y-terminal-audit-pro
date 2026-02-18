import test from 'node:test';
import assert from 'node:assert/strict';

import { SeverityMapper } from '../utils/SeverityMapper.js';

test('stable fingerprint ignores volatile numeric selector fragments', () => {
  const baseIssue = {
    id: 'pa11y-1',
    tool: 'pa11y',
    severity: 2,
    severityLabel: 'serious',
    message: 'Low contrast text',
    url: 'https://example.com/page?cache=123',
    wcagCriteria: [{ id: '1.4.3', level: 'AA' }],
  };

  const first = SeverityMapper.getStableFingerprint({
    ...baseIssue,
    selector: '#rs_slidelink_89033 > span',
  });
  const second = SeverityMapper.getStableFingerprint({
    ...baseIssue,
    selector: '#rs_slidelink_28354 > span',
  });

  assert.equal(first, second);
});

test('stable fingerprint changes when the normalized issue meaning changes', () => {
  const issueA = {
    id: 'axe-1',
    tool: 'axe',
    severity: 2,
    severityLabel: 'serious',
    message: 'Links need accessible names',
    selector: 'a.cta',
    url: 'https://example.com/path',
    wcagCriteria: [{ id: '2.4.4', level: 'A' }],
  };

  const issueB = {
    ...issueA,
    message: 'Images need alt text',
    wcagCriteria: [{ id: '1.1.1', level: 'A' }],
  };

  assert.notEqual(
    SeverityMapper.getStableFingerprint(issueA),
    SeverityMapper.getStableFingerprint(issueB)
  );
});

test('normalizePa11yIssue maps warning to manual-review excluded from compliance', () => {
  const issue = SeverityMapper.normalizePa11yIssue(
    {
      code: 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.BgImage',
      type: 'warning',
      typeCode: 2,
      message: 'Contrast warning',
      selector: '.hero-title',
      context: '<h1 class="hero-title">Title</h1>',
    },
    'https://example.com'
  );

  assert.equal(issue.findingKind, 'manual-review');
  assert.equal(issue.countsTowardCompliance, false);
  assert.equal(issue.findingCertainty, 'manual-review');
  assert.equal(issue.promotionPolicyVersion, null);
  assert.equal(issue.engineMeta.ruleCode, 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.BgImage');
  assert.equal(issue.engineMeta.typeCode, 2);
});

test('normalizePa11yIssue maps error to violation counted for compliance', () => {
  const issue = SeverityMapper.normalizePa11yIssue(
    {
      code: 'WCAG2A.Principle1.Guideline1_1.1_1_1.H30.2',
      type: 'error',
      typeCode: 1,
      message: 'Missing alt text',
      selector: 'img.hero',
      context: '<img class="hero">',
    },
    'https://example.com'
  );

  assert.equal(issue.findingKind, 'violation');
  assert.equal(issue.countsTowardCompliance, true);
  assert.equal(issue.findingCertainty, 'confirmed');
  assert.equal(issue.promotionPolicyVersion, null);
});
