/**
 * Order route results deterministically based on discovery order.
 *
 * @param {any[]} report
 * @param {string[]} routes
 * @returns {any[]}
 */
export function orderReportResults(report, routes) {
  const routeIndex = new Map(routes.map((route, index) => [route, index]));

  return [...report].sort((a, b) => {
    const aIndex = routeIndex.get(a.url);
    const bIndex = routeIndex.get(b.url);

    if (aIndex === undefined && bIndex === undefined) {
      return String(a.url).localeCompare(String(b.url));
    }
    if (aIndex === undefined) return 1;
    if (bIndex === undefined) return -1;
    return aIndex - bIndex;
  });
}

/**
 * Flatten unified issues from route results in deterministic route order.
 *
 * @param {any[]} report
 * @returns {import('../utils/SeverityMapper.js').UnifiedIssue[]}
 */
export function collectUnifiedIssues(report) {
  return report.flatMap((row) => row.unifiedIssues || []);
}

