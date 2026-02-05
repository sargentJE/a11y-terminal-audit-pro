/**
 * Shared audit pipeline typedefs.
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
 */

export const __auditTypes = true;
