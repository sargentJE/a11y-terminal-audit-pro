import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalUrl,
  isDisallowed,
  matchGlob,
  matchesPatterns,
  wildcardRobotsRuleToRegex,
} from '../services/crawler/filters/urlFilters.js';

test('canonicalUrl strips hash, optionally query, and normalizes trailing slash', () => {
  const withQuery = canonicalUrl('https://example.com', true, '/about?x=1#section');
  const withTrailingSlash = canonicalUrl('https://example.com', true, '/about/?x=1#section');
  const rootWithSlash = canonicalUrl('https://example.com', true, '/#section');
  const noQuery = canonicalUrl('https://example.com', false, '/about?x=1#section');

  assert.equal(withQuery, 'https://example.com/about?x=1');
  assert.equal(withTrailingSlash, 'https://example.com/about?x=1');
  assert.equal(rootWithSlash, 'https://example.com/');
  assert.equal(noQuery, 'https://example.com/about');
});

test('wildcard robots rules match path and query variants', () => {
  const regex = wildcardRobotsRuleToRegex('/*?');
  assert.equal(regex.test('/page?x=1'), true);
  assert.equal(regex.test('/page'), false);
});

test('isDisallowed supports direct and wildcard rules', () => {
  const disallowed = new Set(['/admin', '/*?']);
  assert.equal(isDisallowed('https://example.com/admin/users', disallowed), true);
  assert.equal(isDisallowed('https://example.com/page?draft=true', disallowed), true);
  assert.equal(isDisallowed('https://example.com/public', disallowed), false);
});

test('matchesPatterns applies exclude first then include', () => {
  assert.equal(matchGlob('https://example.com/about/team', '*/about/*'), true);
  assert.equal(
    matchesPatterns(
      'https://example.com/about/team',
      ['*/about/*'],
      ['*/about/private/*']
    ),
    true
  );
  assert.equal(
    matchesPatterns(
      'https://example.com/about/private/roadmap',
      ['*/about/*'],
      ['*/about/private/*']
    ),
    false
  );
});
