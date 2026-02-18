/**
 * @typedef {import('../../SeverityMapper.js').UnifiedIssue} UnifiedIssue
 */

/**
 * @param {string|undefined|null} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\d{3,}/g, '{n}')
    .trim();
}

/**
 * @param {string|undefined|null} xpath
 * @returns {string}
 */
function normalizeXpath(xpath) {
  return normalizeText(xpath).replace(/\[\d+\]/g, '[]');
}

/**
 * @param {UnifiedIssue} issue
 * @returns {string}
 */
function buildCrossPageKey(issue) {
  const wcagIds = (issue.wcagCriteria || [])
    .map((criterion) => criterion.id)
    .filter(Boolean)
    .sort()
    .join(',');
  const messageKey = normalizeText(issue.message).slice(0, 160);
  const xpathKey = normalizeXpath(issue?.evidence?.locator?.xpath);
  const selectorKey = normalizeText(issue.selector);
  const snippetKey = normalizeText(issue?.evidence?.snippet || issue.html).slice(0, 120);

  const locationKey =
    xpathKey ||
    selectorKey ||
    snippetKey ||
    normalizeText(issue?.recommendedFix || issue?.help || '').slice(0, 120) ||
    'location:unknown';

  const criterionKey = wcagIds || messageKey;
  return `${criterionKey}::${locationKey}`;
}

/**
 * Deduplicate repeated findings across routes for scoring/aggregation.
 *
 * @param {UnifiedIssue[]} issues
 * @returns {UnifiedIssue[]}
 */
export function dedupeCrossPageIssues(issues) {
  /** @type {Map<string, { primary: UnifiedIssue, urls: Set<string>, ids: Set<string> }>} */
  const grouped = new Map();

  for (const issue of issues || []) {
    const key = buildCrossPageKey(issue);
    if (!grouped.has(key)) {
      grouped.set(key, {
        primary: issue,
        urls: new Set([issue.url].filter(Boolean)),
        ids: new Set([issue.id].filter(Boolean)),
      });
      continue;
    }

    const entry = grouped.get(key);
    entry.urls.add(issue.url);
    entry.ids.add(issue.id);

    const current = entry.primary;
    const nextSeverity = Number(issue.severity);
    const currentSeverity = Number(current.severity);
    if (Number.isFinite(nextSeverity) && (!Number.isFinite(currentSeverity) || nextSeverity < currentSeverity)) {
      entry.primary = issue;
    }

    if (issue.countsTowardCompliance === true && entry.primary.countsTowardCompliance !== true) {
      entry.primary = issue;
    }
  }

  return Array.from(grouped.entries()).map(([crossPageKey, entry]) => {
    const urls = Array.from(entry.urls).sort();
    const mergedFrom = Array.from(entry.ids);
    const occurrenceCount = mergedFrom.length || urls.length || 1;
    return {
      ...entry.primary,
      crossPageKey,
      affectedPages: urls,
      occurrenceCount,
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : entry.primary.mergedFrom,
    };
  });
}
