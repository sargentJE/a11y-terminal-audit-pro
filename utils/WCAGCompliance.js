/**
 * utils/WCAGCompliance.js
 * -----------------------------------------------------------------------------
 * WCAG Compliance Level Calculator
 */

import { SEVERITY } from './SeverityMapper.js';
import { dedupeCrossPageIssues } from './wcag/compliance/dedupeCrossPageIssues.js';

/**
 * @typedef {import('./SeverityMapper.js').UnifiedIssue} UnifiedIssue
 *
 * @typedef {Object} ThresholdResult
 * @property {boolean} passed
 * @property {string[]} failures
 * @property {Object} counts
 */

const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

/**
 * @param {string | undefined} value
 * @returns {'low'|'medium'|'high'}
 */
function normalizeConfidenceThreshold(value) {
  const normalized = String(value || '').toLowerCase();
  return CONFIDENCE_LEVELS.includes(normalized) ? normalized : 'high';
}

/**
 * @param {UnifiedIssue[]} issues
 * @returns {{
 *   critical: number,
 *   serious: number,
 *   moderate: number,
 *   minor: number,
 *   total: number
 * }}
 */
function buildSeveritySummary(issues) {
  const summary = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: issues.length,
  };

  for (const issue of issues) {
    switch (issue.severity) {
      case SEVERITY.CRITICAL:
        summary.critical++;
        break;
      case SEVERITY.SERIOUS:
        summary.serious++;
        break;
      case SEVERITY.MODERATE:
        summary.moderate++;
        break;
      case SEVERITY.MINOR:
        summary.minor++;
        break;
    }
  }

  return summary;
}

/**
 * @param {UnifiedIssue[]} issues
 * @returns {{ failedA: string[], failedAA: string[], failedAAA: string[] }}
 */
function buildWcagSummary(issues) {
  /** @type {Map<string, { name: string, level: string }>} */
  const failedCriteria = new Map();

  for (const issue of issues) {
    for (const criterion of issue.wcagCriteria || []) {
      if (!failedCriteria.has(criterion.id)) {
        failedCriteria.set(criterion.id, {
          name: criterion.name,
          level: criterion.level,
        });
      }
    }
  }

  const wcagSummary = {
    failedA: [],
    failedAA: [],
    failedAAA: [],
  };

  for (const [id, criterion] of failedCriteria) {
    const criterionWithId = `${id}: ${criterion.name}`;
    switch (criterion.level) {
      case 'A':
        wcagSummary.failedA.push(criterionWithId);
        break;
      case 'AA':
        wcagSummary.failedAA.push(criterionWithId);
        break;
      case 'AAA':
        wcagSummary.failedAAA.push(criterionWithId);
        break;
    }
  }

  wcagSummary.failedA.sort();
  wcagSummary.failedAA.sort();
  wcagSummary.failedAAA.sort();
  return wcagSummary;
}

/**
 * @param {UnifiedIssue[]} issues
 * @returns {{
 *   Perceivable: { count: number, issues: string[] },
 *   Operable: { count: number, issues: string[] },
 *   Understandable: { count: number, issues: string[] },
 *   Robust: { count: number, issues: string[] },
 *   Unknown: { count: number, issues: string[] },
 * }}
 */
function buildByPrinciple(issues) {
  const byPrinciple = {
    Perceivable: { count: 0, issues: [] },
    Operable: { count: 0, issues: [] },
    Understandable: { count: 0, issues: [] },
    Robust: { count: 0, issues: [] },
    Unknown: { count: 0, issues: [] },
  };

  for (const issue of issues) {
    const principles = new Set();
    for (const criterion of issue.wcagCriteria || []) {
      if (criterion.principle) principles.add(criterion.principle);
    }

    if (principles.size === 0) {
      byPrinciple.Unknown.count++;
      byPrinciple.Unknown.issues.push(issue.id);
      continue;
    }

    for (const principle of principles) {
      if (byPrinciple[principle]) {
        byPrinciple[principle].count++;
        byPrinciple[principle].issues.push(issue.id);
      }
    }
  }

  return byPrinciple;
}

/**
 * @param {{ failedA: string[], failedAA: string[], failedAAA: string[] }} wcagSummary
 * @param {number} manualReview
 * @returns {{ level: string, description: string }}
 */
function buildComplianceLevel(wcagSummary, manualReview) {
  if (wcagSummary.failedA.length === 0 && wcagSummary.failedAA.length === 0 && wcagSummary.failedAAA.length === 0) {
    return {
      level: 'AAA',
      description: `Site meets WCAG 2.2 Level AAA (highest conformance)${
        manualReview > 0 ? `; ${manualReview} manual-review findings excluded from scoring` : ''
      }`,
    };
  }

  if (wcagSummary.failedA.length === 0 && wcagSummary.failedAA.length === 0) {
    return {
      level: 'AA',
      description: `Site meets WCAG 2.2 Level AA (${wcagSummary.failedAAA.length} Level AAA issues)${
        manualReview > 0 ? `; ${manualReview} manual-review findings excluded from scoring` : ''
      }`,
    };
  }

  if (wcagSummary.failedA.length === 0) {
    return {
      level: 'A',
      description: `Site meets WCAG 2.2 Level A (${wcagSummary.failedAA.length} Level AA issues)${
        manualReview > 0 ? `; ${manualReview} manual-review findings excluded from scoring` : ''
      }`,
    };
  }

  return {
    level: 'Non-Conformant',
    description: `Site does not meet WCAG 2.2 Level A (${wcagSummary.failedA.length} Level A failures)${
      manualReview > 0 ? `; ${manualReview} manual-review findings excluded from scoring` : ''
    }`,
  };
}

/**
 * @param {UnifiedIssue[]} issues
 * @returns {{
 *   manualReviewDominates: boolean,
 *   lowConfidenceDominates: boolean,
 *   certaintyLabel: 'high'|'medium'|'low',
 *   notes: string[]
 * }}
 */
function buildQualitySignals(issues) {
  const total = issues.length;
  const manualReview = issues.filter(
    (issue) => issue.countsTowardCompliance === false || issue.findingKind === 'manual-review'
  ).length;
  const verified = issues.filter((issue) => issue.verification?.confidence);
  const lowConfidence = verified.filter((issue) => issue.verification?.confidence === 'low').length;

  const manualRatio = total > 0 ? manualReview / total : 0;
  const lowConfidenceRatio = verified.length > 0 ? lowConfidence / verified.length : 0;

  const manualReviewDominates = manualRatio >= 0.6;
  const lowConfidenceDominates = lowConfidenceRatio >= 0.5;

  let certaintyLabel = 'high';
  if (manualReviewDominates || lowConfidenceDominates) {
    certaintyLabel = 'low';
  } else if (manualRatio >= 0.35 || lowConfidenceRatio >= 0.3) {
    certaintyLabel = 'medium';
  }

  const notes = [];
  if (manualReviewDominates) {
    notes.push('Manual-review findings dominate reported issues.');
  }
  if (lowConfidenceDominates) {
    notes.push('Low-confidence verification outcomes dominate verified findings.');
  }

  return {
    manualReviewDominates,
    lowConfidenceDominates,
    certaintyLabel,
    notes,
  };
}

export class WCAGCompliance {
  /**
   * @param {{
   *   critical: number,
   *   serious: number,
   *   moderate: number,
   *   minor: number
   * }} summary
   * @param {{ failedA: string[], failedAA: string[], failedAAA: string[] }} wcagSummary
   * @returns {number}
   */
  static #calculateScore(summary, wcagSummary) {
    let score = 100;
    score -= summary.critical * 15;
    score -= summary.serious * 8;
    score -= summary.moderate * 3;
    score -= summary.minor * 1;

    score -= wcagSummary.failedA.length * 10;
    score -= wcagSummary.failedAA.length * 5;
    score -= wcagSummary.failedAAA.length * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * @param {UnifiedIssue[]} issues
   * @param {string} _targetStandard
   * @param {{ includeManualChecks?: boolean, confidenceThreshold?: 'low'|'medium'|'high' }} [options]
   * @returns {any}
   */
  static calculate(issues, _targetStandard = 'WCAG2AA', options = {}) {
    const includeManualChecks = options.includeManualChecks === true;
    const confidenceThreshold = normalizeConfidenceThreshold(options.confidenceThreshold);
    const reportedIssuesRaw = Array.isArray(issues) ? issues : [];
    const confirmedIssuesRaw = reportedIssuesRaw.filter(
      (issue) => issue.countsTowardCompliance !== false
    );
    const reportedIssues = dedupeCrossPageIssues(reportedIssuesRaw);
    const confirmedIssues = dedupeCrossPageIssues(confirmedIssuesRaw);
    const consideredIssues = includeManualChecks ? reportedIssues : confirmedIssues;

    const severitySummary = buildSeveritySummary(consideredIssues);
    const manualReviewCount = reportedIssues.filter(
      (issue) => issue.countsTowardCompliance === false || issue.findingKind === 'manual-review'
    ).length;
    const summary = {
      ...severitySummary,
      manualReview: manualReviewCount,
      consideredTotal: consideredIssues.length,
      reportedTotal: reportedIssues.length,
      inconclusive: reportedIssues.filter((issue) => issue.findingCertainty === 'inconclusive').length,
      promoted: reportedIssues.filter((issue) => issue.findingCertainty === 'promoted').length,
      rawConsideredTotal: includeManualChecks ? reportedIssuesRaw.length : confirmedIssuesRaw.length,
      rawReportedTotal: reportedIssuesRaw.length,
      collapsedDuplicates:
        Math.max(0, reportedIssuesRaw.length - reportedIssues.length),
    };

    const wcagSummary = buildWcagSummary(consideredIssues);
    const confirmedWcagSummary = buildWcagSummary(confirmedIssues);
    const reportedWcagSummary = buildWcagSummary(reportedIssues);
    const byPrinciple = buildByPrinciple(consideredIssues);
    const { level, description } = buildComplianceLevel(
      wcagSummary,
      includeManualChecks ? 0 : manualReviewCount
    );

    const confirmedSummary = buildSeveritySummary(confirmedIssues);
    const reportedSummary = buildSeveritySummary(reportedIssues);
    const confirmedScore = WCAGCompliance.#calculateScore(confirmedSummary, confirmedWcagSummary);
    const reportedScore = WCAGCompliance.#calculateScore(reportedSummary, reportedWcagSummary);
    const score = includeManualChecks ? reportedScore : confirmedScore;
    const qualitySignals = buildQualitySignals(reportedIssues);

    return {
      level,
      description,
      summary,
      wcagSummary,
      byPrinciple,
      score,
      confirmedScore,
      reportedScore,
      qualitySignals,
      sitewideRollup: reportedIssues
        .map((issue) => ({
          crossPageKey: issue.crossPageKey,
          message: issue.message,
          severityLabel: issue.severityLabel,
          findingKind:
            issue.findingKind || (issue.countsTowardCompliance === false ? 'manual-review' : 'violation'),
          findingCertainty: issue.findingCertainty,
          occurrenceCount: issue.occurrenceCount || 1,
          affectedPages: issue.affectedPages || [issue.url].filter(Boolean),
          selector: issue.selector || null,
          wcagCriteria: (issue.wcagCriteria || []).map((criterion) => criterion.id),
        }))
        .sort((a, b) => (b.occurrenceCount || 1) - (a.occurrenceCount || 1)),
      scoringPolicy: {
        includeManualChecks,
        confidenceThreshold,
      },
    };
  }

  /**
   * @param {UnifiedIssue[]} issues
   * @param {number} lighthouseScore
   * @param {Object} thresholds
   * @param {number} [thresholds.maxViolations]
   * @param {number} [thresholds.maxCritical]
   * @param {number} [thresholds.maxSerious]
   * @param {number} [thresholds.minScore]
   * @param {string} [thresholds.minCompliance]
   * @param {{ includeManualChecks?: boolean, confidenceThreshold?: 'low'|'medium'|'high' }} [options]
   * @returns {ThresholdResult}
   */
  static checkThresholds(issues, lighthouseScore, thresholds = {}, options = {}) {
    const compliance = WCAGCompliance.calculate(issues, 'WCAG2AA', options);
    const failures = [];

    const counts = {
      total: compliance.summary.consideredTotal,
      reportedTotal: compliance.summary.reportedTotal,
      manualReview: compliance.summary.manualReview,
      critical: compliance.summary.critical,
      serious: compliance.summary.serious,
      inconclusive: compliance.summary.inconclusive,
      promoted: compliance.summary.promoted,
      lighthouseScore,
      complianceLevel: compliance.level,
      confirmedScore: compliance.confirmedScore,
      reportedScore: compliance.reportedScore,
    };

    if (thresholds.maxViolations !== undefined && thresholds.maxViolations !== Infinity) {
      if (compliance.summary.consideredTotal > thresholds.maxViolations) {
        failures.push(
          `Total confirmed violations (${compliance.summary.consideredTotal}) exceeds threshold (${thresholds.maxViolations})`
        );
      }
    }

    if (thresholds.maxCritical !== undefined && thresholds.maxCritical !== Infinity) {
      if (compliance.summary.critical > thresholds.maxCritical) {
        failures.push(
          `Critical issues (${compliance.summary.critical}) exceeds threshold (${thresholds.maxCritical})`
        );
      }
    }

    if (thresholds.maxSerious !== undefined && thresholds.maxSerious !== Infinity) {
      if (compliance.summary.serious > thresholds.maxSerious) {
        failures.push(
          `Serious issues (${compliance.summary.serious}) exceeds threshold (${thresholds.maxSerious})`
        );
      }
    }

    if (thresholds.minScore !== undefined && thresholds.minScore > 0) {
      if (lighthouseScore < thresholds.minScore) {
        failures.push(`Lighthouse score (${lighthouseScore}) below threshold (${thresholds.minScore})`);
      }
    }

    if (thresholds.minCompliance) {
      const levelOrder = { 'Non-Conformant': 0, A: 1, AA: 2, AAA: 3 };
      const actualLevel = levelOrder[compliance.level] ?? 0;
      const requiredLevel = levelOrder[thresholds.minCompliance] ?? 0;
      if (actualLevel < requiredLevel) {
        failures.push(
          `Compliance level (${compliance.level}) below required (${thresholds.minCompliance})`
        );
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      counts,
    };
  }
}

export default WCAGCompliance;
