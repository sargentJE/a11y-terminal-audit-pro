/**
 * @typedef {import('../../../utils/SeverityMapper.js').UnifiedIssue} UnifiedIssue
 */

/**
 * Score issue evidence quality for merge decisions.
 *
 * @param {UnifiedIssue} issue
 * @returns {number}
 */
function issueEvidenceScore(issue) {
  const evidence = issue?.evidence;
  if (!evidence) return 0;

  const confidenceScore =
    {
      high: 3,
      medium: 2,
      low: 1,
    }[evidence.confidence] || 0;

  const snippetScore = evidence.snippet ? 2 : 0;
  const lineScore = evidence.locator?.line ? 1 : 0;

  return confidenceScore + snippetScore + lineScore;
}

/**
 * Merge two duplicate issues preserving severity precedence and richer evidence.
 *
 * @param {UnifiedIssue} a
 * @param {UnifiedIssue} b
 * @returns {UnifiedIssue}
 */
function mergeDuplicateIssuePair(a, b) {
  const scoreA = issueEvidenceScore(a);
  const scoreB = issueEvidenceScore(b);

  let primary = a;
  let secondary = b;

  if (b.severity < a.severity) {
    primary = b;
    secondary = a;
  } else if (a.severity === b.severity && scoreB > scoreA) {
    primary = b;
    secondary = a;
  }

  const primaryWcag = primary.wcagCriteria || [];
  const secondaryWcag = secondary.wcagCriteria || [];
  const mergedWcag = [
    ...primaryWcag,
    ...secondaryWcag.filter(
      (criterion) => !primaryWcag.some((aCriterion) => aCriterion.id === criterion.id)
    ),
  ];

  const secondaryEvidenceScore = issueEvidenceScore(secondary);
  const evidence =
    secondaryEvidenceScore > issueEvidenceScore(primary) ? secondary.evidence : primary.evidence;

  return {
    ...primary,
    wcagCriteria: mergedWcag,
    help: primary.help || secondary.help,
    helpUrl: primary.helpUrl || secondary.helpUrl,
    evidence,
  };
}

/**
 * Deduplicate issues across tools by selector and WCAG criteria.
 *
 * @param {UnifiedIssue[]} issues
 * @returns {UnifiedIssue[]}
 */
export function deduplicateIssues(issues) {
  /** @type {Map<string, UnifiedIssue>} */
  const uniqueIssues = new Map();

  for (const issue of issues) {
    const wcagIds = (issue.wcagCriteria || [])
      .map((c) => c.id)
      .sort()
      .join(',');
    const key = `${issue.selector || 'no-selector'}::${wcagIds || issue.message.substring(0, 50)}`;

    if (!uniqueIssues.has(key)) {
      uniqueIssues.set(key, issue);
    } else {
      const existing = uniqueIssues.get(key);
      uniqueIssues.set(key, mergeDuplicateIssuePair(existing, issue));
    }
  }

  return Array.from(uniqueIssues.values());
}

export default deduplicateIssues;
