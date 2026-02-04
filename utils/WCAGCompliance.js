/**
 * utils/WCAGCompliance.js
 * -----------------------------------------------------------------------------
 * WCAG Compliance Level Calculator
 *
 * Determines overall site compliance level (A, AA, AAA, or Non-Conformant)
 * based on unified accessibility issues and their WCAG criteria mappings.
 *
 * Conformance Rules (per WCAG 2.2):
 * - Level A: All Level A success criteria satisfied
 * - Level AA: All Level A + AA success criteria satisfied
 * - Level AAA: All Level A + AA + AAA success criteria satisfied
 */

import { SEVERITY } from './SeverityMapper.js';

/**
 * @typedef {import('./SeverityMapper.js').UnifiedIssue} UnifiedIssue
 * @typedef {import('./SeverityMapper.js').WCAGCriterion} WCAGCriterion
 */

/**
 * @typedef {Object} ComplianceResult
 * @property {string} level - Conformance level: 'AAA' | 'AA' | 'A' | 'Non-Conformant'
 * @property {string} description - Human-readable description
 * @property {Object} summary - Issue counts by severity
 * @property {number} summary.critical - Critical issue count
 * @property {number} summary.serious - Serious issue count
 * @property {number} summary.moderate - Moderate issue count
 * @property {number} summary.minor - Minor issue count
 * @property {number} summary.total - Total issue count
 * @property {Object} wcagSummary - Issues by WCAG level
 * @property {string[]} wcagSummary.failedA - Failed Level A criteria
 * @property {string[]} wcagSummary.failedAA - Failed Level AA criteria
 * @property {string[]} wcagSummary.failedAAA - Failed Level AAA criteria
 * @property {Object} byPrinciple - Issues grouped by WCAG principle
 * @property {number} score - Numeric compliance score (0-100)
 */

/**
 * @typedef {Object} ThresholdResult
 * @property {boolean} passed - Whether all thresholds passed
 * @property {string[]} failures - List of failed threshold descriptions
 * @property {Object} counts - Actual counts for each threshold type
 */

export class WCAGCompliance {
  /**
   * Calculate overall WCAG compliance level from unified issues.
   *
   * @param {UnifiedIssue[]} issues - Array of unified accessibility issues
   * @param {string} targetStandard - Target WCAG standard (e.g., 'WCAG2AA')
   * @returns {ComplianceResult}
   */
  static calculate(issues, _targetStandard = 'WCAG2AA') {
    // Count issues by severity
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

    // Track failed WCAG criteria by level
    const failedCriteria = new Map();

    for (const issue of issues) {
      for (const criterion of issue.wcagCriteria || []) {
        if (!failedCriteria.has(criterion.id)) {
          failedCriteria.set(criterion.id, {
            criterion,
            issues: [],
          });
        }
        failedCriteria.get(criterion.id).issues.push(issue);
      }
    }

    // Categorize failed criteria by level
    const wcagSummary = {
      failedA: [],
      failedAA: [],
      failedAAA: [],
    };

    for (const [id, { criterion }] of failedCriteria) {
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

    // Sort for consistent output
    wcagSummary.failedA.sort();
    wcagSummary.failedAA.sort();
    wcagSummary.failedAAA.sort();

    // Group issues by WCAG principle
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
        if (criterion.principle) {
          principles.add(criterion.principle);
        }
      }

      if (principles.size === 0) {
        byPrinciple.Unknown.count++;
        byPrinciple.Unknown.issues.push(issue.id);
      } else {
        for (const principle of principles) {
          if (byPrinciple[principle]) {
            byPrinciple[principle].count++;
            byPrinciple[principle].issues.push(issue.id);
          }
        }
      }
    }

    // Determine compliance level
    let level;
    let description;

    if (wcagSummary.failedA.length === 0 && wcagSummary.failedAA.length === 0 && wcagSummary.failedAAA.length === 0) {
      level = 'AAA';
      description = 'Site meets WCAG 2.2 Level AAA (highest conformance)';
    } else if (wcagSummary.failedA.length === 0 && wcagSummary.failedAA.length === 0) {
      level = 'AA';
      description = `Site meets WCAG 2.2 Level AA (${wcagSummary.failedAAA.length} Level AAA issues)`;
    } else if (wcagSummary.failedA.length === 0) {
      level = 'A';
      description = `Site meets WCAG 2.2 Level A (${wcagSummary.failedAA.length} Level AA issues)`;
    } else {
      level = 'Non-Conformant';
      description = `Site does not meet WCAG 2.2 Level A (${wcagSummary.failedA.length} Level A failures)`;
    }

    // Calculate numeric score (weighted by severity and WCAG level)
    const score = WCAGCompliance.#calculateScore(summary, wcagSummary);

    return {
      level,
      description,
      summary,
      wcagSummary,
      byPrinciple,
      score,
    };
  }

  /**
   * Calculate a numeric compliance score (0-100).
   *
   * Scoring factors:
   * - Base score of 100
   * - Deductions weighted by severity and WCAG level
   *
   * @private
   * @param {Object} summary - Issue counts by severity
   * @param {Object} wcagSummary - Failed criteria by level
   * @returns {number}
   */
  static #calculateScore(summary, wcagSummary) {
    let score = 100;

    // Deduct points per issue (weighted by severity)
    score -= summary.critical * 15; // Critical issues: -15 each
    score -= summary.serious * 8;   // Serious issues: -8 each
    score -= summary.moderate * 3;  // Moderate issues: -3 each
    score -= summary.minor * 1;     // Minor issues: -1 each

    // Additional deductions for WCAG level failures
    score -= wcagSummary.failedA.length * 10;  // Level A failures: -10 each
    score -= wcagSummary.failedAA.length * 5;  // Level AA failures: -5 each
    score -= wcagSummary.failedAAA.length * 2; // Level AAA failures: -2 each

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Check if results pass the configured thresholds.
   *
   * @param {UnifiedIssue[]} issues - Unified issues
   * @param {number} lighthouseScore - Lighthouse accessibility score (0-100)
   * @param {Object} thresholds - Threshold configuration
   * @param {number} [thresholds.maxViolations] - Maximum total violations
   * @param {number} [thresholds.maxCritical] - Maximum critical issues
   * @param {number} [thresholds.maxSerious] - Maximum serious issues
   * @param {number} [thresholds.minScore] - Minimum Lighthouse score
   * @param {string} [thresholds.minCompliance] - Minimum compliance level
   * @returns {ThresholdResult}
   */
  static checkThresholds(issues, lighthouseScore, thresholds = {}) {
    const compliance = WCAGCompliance.calculate(issues);
    const failures = [];

    const counts = {
      total: issues.length,
      critical: compliance.summary.critical,
      serious: compliance.summary.serious,
      lighthouseScore,
      complianceLevel: compliance.level,
    };

    // Check total violations
    if (thresholds.maxViolations !== undefined && thresholds.maxViolations !== Infinity) {
      if (issues.length > thresholds.maxViolations) {
        failures.push(
          `Total violations (${issues.length}) exceeds threshold (${thresholds.maxViolations})`
        );
      }
    }

    // Check critical issues
    if (thresholds.maxCritical !== undefined && thresholds.maxCritical !== Infinity) {
      if (compliance.summary.critical > thresholds.maxCritical) {
        failures.push(
          `Critical issues (${compliance.summary.critical}) exceeds threshold (${thresholds.maxCritical})`
        );
      }
    }

    // Check serious issues
    if (thresholds.maxSerious !== undefined && thresholds.maxSerious !== Infinity) {
      if (compliance.summary.serious > thresholds.maxSerious) {
        failures.push(
          `Serious issues (${compliance.summary.serious}) exceeds threshold (${thresholds.maxSerious})`
        );
      }
    }

    // Check Lighthouse score
    if (thresholds.minScore !== undefined && thresholds.minScore > 0) {
      if (lighthouseScore < thresholds.minScore) {
        failures.push(
          `Lighthouse score (${lighthouseScore}) below threshold (${thresholds.minScore})`
        );
      }
    }

    // Check compliance level
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

  /**
   * Get a compliance badge color based on level.
   *
   * @param {string} level - Compliance level
   * @returns {string} - Color name for badge
   */
  static getBadgeColor(level) {
    switch (level) {
      case 'AAA':
        return 'green';
      case 'AA':
        return 'blue';
      case 'A':
        return 'yellow';
      default:
        return 'red';
    }
  }

  /**
   * Generate a text summary of compliance results.
   *
   * @param {ComplianceResult} result - Compliance calculation result
   * @returns {string}
   */
  static formatSummary(result) {
    const lines = [
      `WCAG Compliance Level: ${result.level}`,
      result.description,
      '',
      `Compliance Score: ${result.score}/100`,
      '',
      'Issues by Severity:',
      `  Critical: ${result.summary.critical}`,
      `  Serious:  ${result.summary.serious}`,
      `  Moderate: ${result.summary.moderate}`,
      `  Minor:    ${result.summary.minor}`,
      `  Total:    ${result.summary.total}`,
      '',
      'Issues by WCAG Principle:',
      `  Perceivable:    ${result.byPrinciple.Perceivable.count}`,
      `  Operable:       ${result.byPrinciple.Operable.count}`,
      `  Understandable: ${result.byPrinciple.Understandable.count}`,
      `  Robust:         ${result.byPrinciple.Robust.count}`,
    ];

    if (result.wcagSummary.failedA.length > 0) {
      lines.push('', 'Failed Level A Criteria:');
      for (const c of result.wcagSummary.failedA) {
        lines.push(`  - ${c}`);
      }
    }

    if (result.wcagSummary.failedAA.length > 0) {
      lines.push('', 'Failed Level AA Criteria:');
      for (const c of result.wcagSummary.failedAA) {
        lines.push(`  - ${c}`);
      }
    }

    if (result.wcagSummary.failedAAA.length > 0) {
      lines.push('', 'Failed Level AAA Criteria:');
      for (const c of result.wcagSummary.failedAAA) {
        lines.push(`  - ${c}`);
      }
    }

    return lines.join('\n');
  }
}

export default WCAGCompliance;
