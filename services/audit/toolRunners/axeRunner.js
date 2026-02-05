import { SeverityMapper } from '../../../utils/SeverityMapper.js';
import { withRetry } from '../shared/retry.js';

/**
 * @param {any} v
 * @param {number} maxNodes
 */
function reduceAxeViolation(v, maxNodes = 5) {
  return {
    id: v.id,
    impact: v.impact || null,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags || [],
    nodes: (v.nodes || []).slice(0, maxNodes).map((n) => ({
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary || null,
    })),
  };
}

/**
 * @param {object} params
 * @param {string} params.url
 * @param {import('puppeteer').Page} params.page
 * @param {number} params.timeoutMs
 * @param {boolean} params.includeDetails
 * @param {number} params.maxRetries
 * @param {number} params.retryDelayMs
 * @param {{ debug: (msg: string) => void }} params.log
 * @returns {Promise<{ axeViolations: number, axe: any, issues: any[], pageHtml: string }>}
 */
export async function runAxeAudit({
  url,
  page,
  timeoutMs,
  includeDetails,
  maxRetries,
  retryDelayMs,
  log,
}) {
  return withRetry(
    async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});
      const pageHtml = await page.content().catch(() => '');

      const axeMod = await import('@axe-core/puppeteer');
      const { AxePuppeteer } = axeMod;

      const axeResults = await new AxePuppeteer(page).analyze();
      const violations = axeResults?.violations || [];
      const axeViolations = violations.length;

      const issues = [];
      for (const violation of violations) {
        const normalized = SeverityMapper.normalizeAxeViolation(violation, url);
        issues.push(...normalized);
      }

      const axeSection = includeDetails
        ? axeResults
        : {
            violationsCount: violations.length,
            violations: violations.map((v) => reduceAxeViolation(v)),
          };

      return {
        axeViolations,
        axe: axeSection,
        issues,
        pageHtml,
      };
    },
    maxRetries,
    retryDelayMs,
    `axe audit for ${url}`,
    log
  );
}

export default runAxeAudit;
