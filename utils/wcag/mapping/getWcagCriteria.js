import { WCAG_CRITERIA } from '../data/wcagCriteria.js';
import { AXE_TO_WCAG } from '../data/axeToWcag.js';
import { PA11Y_TO_WCAG } from '../data/pa11yToWcag.js';
import { LIGHTHOUSE_TO_WCAG } from '../data/lighthouseToWcag.js';

/**
 * @param {string[]} criteriaIds
 * @returns {Array<{id: string, name: string, level: string, principle: string, guideline: string}>}
 */
export function mapCriteriaIds(criteriaIds) {
  return criteriaIds
    .map((id) => ({
      id,
      ...WCAG_CRITERIA[id],
    }))
    .filter((c) => c.name);
}

/**
 * @param {string} ruleId
 */
export function getWcagForAxeRule(ruleId) {
  const criteriaIds = AXE_TO_WCAG[ruleId] ?? [];
  return mapCriteriaIds(criteriaIds);
}

/**
 * @param {string} code
 */
export function getWcagForPa11yRule(code) {
  let criteriaIds = PA11Y_TO_WCAG[code];

  if (!criteriaIds) {
    const match = code.match(/Guideline(\d+)_(\d+)\.(\d+)_(\d+)_(\d+)/);
    if (match) {
      const criterionId = `${match[3]}.${match[4]}.${match[5]}`;
      if (WCAG_CRITERIA[criterionId]) {
        criteriaIds = [criterionId];
      }
    }
  }

  if (!criteriaIds) return [];
  return mapCriteriaIds(criteriaIds);
}

/**
 * @param {string} auditId
 */
export function getWcagForLighthouseAudit(auditId) {
  const criteriaIds = LIGHTHOUSE_TO_WCAG[auditId] ?? [];
  return mapCriteriaIds(criteriaIds);
}

export { WCAG_CRITERIA };
