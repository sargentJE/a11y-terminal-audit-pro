import { SeverityMapper } from '../../../utils/SeverityMapper.js';
import { withRetry } from '../shared/retry.js';

/**
 * Pa11y (HTMLCS) only supports WCAG2A/AA/AAA. This tool accepts WCAG 2.1/2.2
 * labels for scoring/mapping, so we down-level for Pa11y execution.
 *
 * @param {string} standard
 * @returns {'WCAG2A'|'WCAG2AA'|'WCAG2AAA'}
 */
function toPa11yStandard(standard) {
  const s = String(standard || '').toUpperCase();
  if (s.includes('AAA')) return 'WCAG2AAA';
  // Ensure AA is checked before the trailing 'A' case.
  if (s.endsWith('AA')) return 'WCAG2AA';
  return 'WCAG2A';
}

/**
 * @param {any} i
 */
function reducePa11yIssue(i) {
  return {
    code: i.code,
    type: i.type,
    typeCode: i.typeCode,
    message: i.message,
    selector: i.selector || null,
    context: i.context || null,
    runner: i.runner || null,
  };
}

/**
 * @param {object} params
 * @param {string} params.url
 * @param {{ browser: import('puppeteer').Browser }} params.instance
 * @param {number} params.timeoutMs
 * @param {string} params.standard
 * @param {boolean} params.includeDetails
 * @param {Record<string, string>|undefined} params.headers
 * @param {Array<any>|undefined} params.cookies
 * @param {number} params.maxRetries
 * @param {number} params.retryDelayMs
 * @param {{ debug: (msg: string) => void }} params.log
 * @returns {Promise<{ pa11yIssues: number, pa11y: any, issues: any[] }>}
 */
export async function runPa11yAudit({
  url,
  instance,
  timeoutMs,
  standard,
  includeDetails,
  headers,
  cookies,
  maxRetries,
  retryDelayMs,
  log,
}) {
  return withRetry(
    async () => {
      const pa11yMod = await import('pa11y');
      const pa11y = pa11yMod.default || pa11yMod;
      const pa11yStandard = toPa11yStandard(standard);

      const pa11yResults = await pa11y(url, {
        browser: instance.browser,
        timeout: timeoutMs,
        standard: pa11yStandard,
        headers,
        cookies,
        runners: ['htmlcs'],
        includeNotices: false,
        includeWarnings: true,
      });

      const issues = pa11yResults?.issues || [];
      const pa11yIssues = issues.length;

      const normalizedIssues = [];
      for (const issue of issues) {
        const normalized = SeverityMapper.normalizePa11yIssue(issue, url);
        normalizedIssues.push(normalized);
      }

      const pa11ySection = includeDetails
        ? pa11yResults
        : {
            issuesCount: issues.length,
            issues: issues.slice(0, 200).map(reducePa11yIssue),
          };

      return {
        pa11yIssues,
        pa11y: pa11ySection,
        issues: normalizedIssues,
      };
    },
    maxRetries,
    retryDelayMs,
    `Pa11y audit for ${url}`,
    log
  );
}

export default runPa11yAudit;
