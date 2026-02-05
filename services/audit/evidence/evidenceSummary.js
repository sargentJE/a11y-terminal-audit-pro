/**
 * @typedef {import('../../../utils/SeverityMapper.js').UnifiedIssue} UnifiedIssue
 */

/**
 * Build route-level evidence telemetry summary.
 *
 * @param {UnifiedIssue[]} issues
 * @param {boolean} enabled
 * @param {number} extractionMs
 * @returns {{ enabled: boolean, totalIssues: number, high: number, medium: number, low: number, unresolved: number, extractionMs: number }}
 */
export function summarizeEvidence(issues, enabled, extractionMs) {
  const summary = {
    enabled: Boolean(enabled),
    totalIssues: issues.length,
    high: 0,
    medium: 0,
    low: 0,
    unresolved: 0,
    extractionMs: Math.max(0, Number(extractionMs) || 0),
  };

  for (const issue of issues) {
    const confidence = issue.evidence?.confidence;
    if (confidence === 'high') summary.high += 1;
    else if (confidence === 'medium') summary.medium += 1;
    else if (confidence === 'low') summary.low += 1;
    else if (!enabled) continue;
    else summary.low += 1;

    if (issue.evidence?.source === 'tool-context' || issue.evidence?.captureError) {
      summary.unresolved += 1;
    }
  }

  return summary;
}

export default summarizeEvidence;
