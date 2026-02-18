/**
 * @param {any} issue
 * @returns {string|null}
 */
export function getRecommendedFix(issue) {
  const wcagIds = new Set((issue.wcagCriteria || []).map((criterion) => criterion.id));
  const message = String(issue.message || '').toLowerCase();

  if (wcagIds.has('1.3.1') && message.includes('heading')) {
    return 'Fix heading hierarchy: avoid skipping levels (for example, change h3 to h2 or add an intermediate h2 heading before the h3).';
  }

  if (wcagIds.has('1.4.3') && issue.verification?.status === 'failed') {
    const threshold = Number(issue.verification.threshold) > 0 ? issue.verification.threshold : 4.5;
    return `Increase text/background contrast to at least ${threshold}:1 for this element (adjust text color, overlay, or background treatment).`;
  }

  return null;
}

/**
 * @param {any[]} issues
 * @returns {any[]}
 */
export function applyRemediationHints(issues) {
  return issues.map((issue) => {
    const recommendedFix = getRecommendedFix(issue);
    if (!recommendedFix) return issue;
    return {
      ...issue,
      recommendedFix,
    };
  });
}

export default applyRemediationHints;
