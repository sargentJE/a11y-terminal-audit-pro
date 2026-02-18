import { createHash } from 'node:crypto';

/**
 * @typedef {import('../../../utils/SeverityMapper.js').UnifiedIssue} UnifiedIssue
 */

/**
 * @param {string|undefined} url
 * @returns {string}
 */
function normaliseIssuePath(url) {
  if (!url) return '/';
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname || '/';
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }
    return pathname || '/';
  } catch {
    return '/';
  }
}

/**
 * @param {string|undefined} selector
 * @returns {string}
 */
function normaliseSelector(selector) {
  return String(selector || '')
    .toLowerCase()
    .replace(/\d{3,}/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string|undefined} source
 * @returns {string}
 */
function normaliseNodeSignature(source) {
  const normalized = String(source || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/["'][^"']{1,120}["']/g, '"{text}"')
    .trim();
  if (!normalized) return '';
  return createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

/**
 * @param {UnifiedIssue} issue
 * @returns {string}
 */
function buildLocationKey(issue) {
  const locator = issue?.evidence?.locator;
  if (locator?.xpath) {
    return `xpath:${String(locator.xpath).trim()}`;
  }

  const line = Number(locator?.line);
  const column = Number(locator?.column);
  if (Number.isFinite(line) && line > 0) {
    return `line:${line}:${Number.isFinite(column) && column > 0 ? column : 0}`;
  }

  const selector = normaliseSelector(issue?.selector);
  if (selector) {
    const signature = normaliseNodeSignature(
      issue?.evidence?.snippet || issue?.html || ''
    );
    return signature ? `selector:${selector}:sig:${signature}` : `selector:${selector}`;
  }

  return 'location:unknown';
}

/**
 * @param {UnifiedIssue} issue
 * @returns {string}
 */
function buildIssueKey(issue) {
  const wcagIds = (issue.wcagCriteria || [])
    .map((c) => c.id)
    .sort()
    .join(',');
  const criteriaOrMessage = wcagIds || String(issue.message || '').slice(0, 80);
  return `${normaliseIssuePath(issue.url)}::${buildLocationKey(issue)}::${criteriaOrMessage}`;
}

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
  const helpA = String(primary.help || '');
  const helpB = String(secondary.help || '');
  const help = helpA.length >= helpB.length ? primary.help : secondary.help;

  const corroboratedBy = [...new Set([
    ...(Array.isArray(a.corroboratedBy) ? a.corroboratedBy : [a.tool].filter(Boolean)),
    ...(Array.isArray(b.corroboratedBy) ? b.corroboratedBy : [b.tool].filter(Boolean)),
  ])];

  const mergedFrom = [...new Set([
    ...(Array.isArray(a.mergedFrom) ? a.mergedFrom : [a.id].filter(Boolean)),
    ...(Array.isArray(b.mergedFrom) ? b.mergedFrom : [b.id].filter(Boolean)),
  ])];

  const countsTowardCompliance =
    Boolean(primary.countsTowardCompliance) || Boolean(secondary.countsTowardCompliance);
  const findingKind = countsTowardCompliance ? 'violation' : 'manual-review';
  const certaintyCandidates = [a.findingCertainty, b.findingCertainty];
  const findingCertainty = countsTowardCompliance
    ? certaintyCandidates.includes('promoted')
      ? 'promoted'
      : 'confirmed'
    : certaintyCandidates.includes('inconclusive')
      ? 'inconclusive'
      : 'manual-review';
  const promotionPolicyVersion =
    (primary.findingCertainty === 'promoted' ? primary.promotionPolicyVersion : null) ||
    (secondary.findingCertainty === 'promoted' ? secondary.promotionPolicyVersion : null) ||
    primary.promotionPolicyVersion ||
    secondary.promotionPolicyVersion ||
    null;

  const verificationInputs = [...new Set([
    ...(Array.isArray(a.verificationInputs) ? a.verificationInputs : []),
    ...(Array.isArray(b.verificationInputs) ? b.verificationInputs : []),
    a.verification?.inputsHash || null,
    b.verification?.inputsHash || null,
  ].filter(Boolean))];

  const verification = (() => {
    const verificationA = a.verification;
    const verificationB = b.verification;
    if (!verificationA) return verificationB;
    if (!verificationB) return verificationA;

    if (verificationA.status === 'failed' && verificationB.status !== 'failed') return verificationA;
    if (verificationB.status === 'failed' && verificationA.status !== 'failed') return verificationB;

    const confidenceRank = { low: 1, medium: 2, high: 3 };
    const rankA = confidenceRank[verificationA.confidence] || 0;
    const rankB = confidenceRank[verificationB.confidence] || 0;
    if (rankB > rankA) return verificationB;
    return verificationA;
  })();

  return {
    ...primary,
    wcagCriteria: mergedWcag,
    help,
    helpUrl: primary.helpUrl || secondary.helpUrl,
    evidence,
    corroboratedBy,
    mergedFrom,
    countsTowardCompliance,
    findingKind,
    findingCertainty,
    promotionPolicyVersion,
    verificationInputs,
    verification: verification
      ? {
          ...verification,
          inputsHash: verification.inputsHash || verificationInputs[0] || null,
        }
      : verification,
  };
}

/**
 * Deduplicate issues across tools on the same page by semantic location and WCAG criteria.
 *
 * @param {UnifiedIssue[]} issues
 * @returns {UnifiedIssue[]}
 */
export function deduplicateIssues(issues) {
  /** @type {Map<string, UnifiedIssue>} */
  const uniqueIssues = new Map();

  for (const issue of issues) {
    const key = buildIssueKey(issue);

    if (!uniqueIssues.has(key)) {
      uniqueIssues.set(key, {
        ...issue,
        findingCertainty:
          issue.findingCertainty ||
          (issue.countsTowardCompliance === false ? 'manual-review' : 'confirmed'),
        promotionPolicyVersion: issue.promotionPolicyVersion || null,
        corroboratedBy: Array.isArray(issue.corroboratedBy)
          ? [...new Set(issue.corroboratedBy)]
          : [issue.tool].filter(Boolean),
        mergedFrom: Array.isArray(issue.mergedFrom)
          ? [...new Set(issue.mergedFrom)]
          : [issue.id].filter(Boolean),
        verificationInputs: [...new Set([
          ...(Array.isArray(issue.verificationInputs) ? issue.verificationInputs : []),
          issue.verification?.inputsHash || null,
        ].filter(Boolean))],
      });
    } else {
      const existing = uniqueIssues.get(key);
      uniqueIssues.set(key, mergeDuplicateIssuePair(existing, issue));
    }
  }

  return Array.from(uniqueIssues.values());
}

export default deduplicateIssues;
