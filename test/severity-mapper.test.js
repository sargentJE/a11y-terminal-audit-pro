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
