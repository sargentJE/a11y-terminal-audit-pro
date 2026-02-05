/**
 * utils/SeverityMapper.js
 * -----------------------------------------------------------------------------
 * Unified severity scoring and WCAG criteria mapping.
 */

import {
  getWcagForAxeRule,
  getWcagForLighthouseAudit,
  getWcagForPa11yRule,
  WCAG_CRITERIA,
} from './wcag/mapping/getWcagCriteria.js';
import {
  getStableFingerprint as computeStableFingerprint,
  withStableFingerprint as attachStableFingerprint,
} from './wcag/fingerprint/stableFingerprint.js';

/** Severity level constants */
export const SEVERITY = {
  CRITICAL: 1,
  SERIOUS: 2,
  MODERATE: 3,
  MINOR: 4,
};

/** Severity labels */
const SEVERITY_LABELS = {
  1: 'critical',
  2: 'serious',
  3: 'moderate',
  4: 'minor',
};

export class SeverityMapper {
  /**
   * @param {string} impact
   * @returns {number}
   */
  static axeSeverity(impact) {
    const mapping = {
      critical: SEVERITY.CRITICAL,
      serious: SEVERITY.SERIOUS,
      moderate: SEVERITY.MODERATE,
      minor: SEVERITY.MINOR,
    };
    return mapping[impact] ?? SEVERITY.MODERATE;
  }

  /**
   * @param {string} type
   * @returns {number}
   */
  static pa11ySeverity(type) {
    const mapping = {
      error: SEVERITY.SERIOUS,
      warning: SEVERITY.MODERATE,
      notice: SEVERITY.MINOR,
    };
    return mapping[type] ?? SEVERITY.MODERATE;
  }

  /**
   * @param {number} weight
   * @returns {number}
   */
  static lighthouseSeverity(weight) {
    if (weight >= 0.7) return SEVERITY.CRITICAL;
    if (weight >= 0.4) return SEVERITY.SERIOUS;
    if (weight >= 0.1) return SEVERITY.MODERATE;
    return SEVERITY.MINOR;
  }

  /**
   * @param {string} ruleId
   */
  static getWcagForAxeRule(ruleId) {
    return getWcagForAxeRule(ruleId);
  }

  /**
   * @param {string} code
   */
  static getWcagForPa11yRule(code) {
    return getWcagForPa11yRule(code);
  }

  /**
   * @param {string} auditId
   */
  static getWcagForLighthouseAudit(auditId) {
    return getWcagForLighthouseAudit(auditId);
  }

  /**
   * @param {Object} violation
   * @param {string} url
   * @returns {any[]}
   */
  static normalizeAxeViolation(violation, url) {
    const severity = SeverityMapper.axeSeverity(violation.impact);
    const wcagCriteria = SeverityMapper.getWcagForAxeRule(violation.id);

    return (violation.nodes || []).map((node, idx) => ({
      id: `axe-${violation.id}-${idx}`,
      tool: 'axe',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: violation.description || violation.help,
      selector: node.target?.join(' ') || node.html,
      html: node.html,
      url,
      wcagCriteria,
      help: violation.help,
      helpUrl: violation.helpUrl,
    }));
  }

  /**
   * @param {Object} issue
   * @param {string} url
   * @returns {any}
   */
  static normalizePa11yIssue(issue, url) {
    const severity = SeverityMapper.pa11ySeverity(issue.type);
    const wcagCriteria = SeverityMapper.getWcagForPa11yRule(issue.code);

    return {
      id: `pa11y-${issue.code}-${issue.selector || 'unknown'}`,
      tool: 'pa11y',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: issue.message,
      selector: issue.selector,
      html: issue.context,
      url,
      wcagCriteria,
      help: issue.message,
      helpUrl: null,
    };
  }

  /**
   * @param {Object} audit
   * @param {string} url
   * @returns {any[]}
   */
  static normalizeLighthouseAudit(audit, url) {
    const weight = audit.weight ?? 0.5;
    const severity = SeverityMapper.lighthouseSeverity(weight);
    const wcagCriteria = SeverityMapper.getWcagForLighthouseAudit(audit.id);

    const items = audit.details?.items || [{}];

    return items.map((item, idx) => ({
      id: `lighthouse-${audit.id}-${idx}`,
      tool: 'lighthouse',
      severity,
      severityLabel: SEVERITY_LABELS[severity],
      message: audit.title || audit.description,
      selector: item.node?.selector || item.selector,
      html: item.node?.snippet || item.snippet,
      url,
      wcagCriteria,
      help: audit.description,
      helpUrl: null,
    }));
  }

  /**
   * @param {any} issue
   * @returns {string}
   */
  static getStableFingerprint(issue) {
    return computeStableFingerprint(issue);
  }

  /**
   * @param {any} issue
   * @returns {any}
   */
  static withStableFingerprint(issue) {
    return attachStableFingerprint(issue);
  }

  /**
   * @param {number} severity
   * @returns {string}
   */
  static getSeverityLabel(severity) {
    return SEVERITY_LABELS[severity] || 'unknown';
  }

  /**
   * @returns {Object<string, any>}
   */
  static getAllWcagCriteria() {
    return WCAG_CRITERIA;
  }
}

export default SeverityMapper;
