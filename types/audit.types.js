/**
 * Shared audit pipeline typedefs.
 *
 * @typedef {'lighthouse'|'axe'|'pa11y'} AuditToolName
 *
 * @typedef {Object} AuditToolError
 * @property {string} message
 *
 * @typedef {Object} AuditResult
 * @property {string} url
 * @property {string} startedAt
 * @property {number} durationMs
 * @property {number|null} lhScore
 * @property {number|null} axeViolations
 * @property {number|null} pa11yIssues
 * @property {Array<any>} unifiedIssues
 * @property {number} totalIssues
 * @property {Object<string, AuditToolError>} errors
 * @property {AuditToolName[]} [tools] - Selected tools for this run
 */

export const __auditTypes = true;
