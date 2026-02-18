/**
 * Shared report typedefs.
 *
 * @typedef {'lighthouse'|'axe'|'pa11y'} ReportToolName
 *
 * @typedef {Object} ReportMeta
 * @property {string} tool
 * @property {string} version
 * @property {string} generatedAt
 * @property {string} baseUrl
 * @property {string} standard
 * @property {ReportToolName[]} [tools] - Selected tools for the run
 *
 * @typedef {Object} ReportPayload
 * @property {ReportMeta} meta
 * @property {Array<any>} results
 * @property {Object} compliance
 */

export const __reportTypes = true;
