import { createHash } from 'node:crypto';

/**
 * @param {string|undefined} url
 * @returns {string}
 */
function normaliseIssuePath(url) {
  if (!url) return '/';
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return '/';
  }
}

/**
 * @param {string} selector
 * @returns {string}
 */
function normaliseSelector(selector) {
  return selector
    .toLowerCase()
    .replace(/\d{3,}/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {any} issue
 * @returns {string}
 */
export function getStableFingerprint(issue) {
  const urlPath = normaliseIssuePath(issue?.url);
  const normalizedSelector = normaliseSelector(issue?.selector || '');
  const normalizedMessage = String(issue?.message || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const wcagIds = (issue?.wcagCriteria || [])
    .map((criterion) => criterion.id)
    .filter(Boolean)
    .sort()
    .join(',');

  const payload = [
    issue?.tool || 'unknown-tool',
    urlPath,
    wcagIds,
    normalizedMessage,
    normalizedSelector,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

/**
 * @param {any} issue
 * @returns {any}
 */
export function withStableFingerprint(issue) {
  return {
    ...issue,
    stableFingerprint: getStableFingerprint(issue),
  };
}

export default getStableFingerprint;
