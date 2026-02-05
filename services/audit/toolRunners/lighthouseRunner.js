import lighthouse from 'lighthouse';
import { SeverityMapper } from '../../../utils/SeverityMapper.js';
import { withRetry } from '../shared/retry.js';

/**
 * @param {object} params
 * @param {string} params.url
 * @param {{ port: number }} params.instance
 * @param {number} params.timeoutMs
 * @param {boolean} params.includeDetails
 * @param {Record<string, string>|undefined} params.headers
 * @param {boolean} params.hasAuth
 * @param {number} params.maxRetries
 * @param {number} params.retryDelayMs
 * @param {{ debug: (msg: string) => void }} params.log
 * @returns {Promise<{ lhScore: number|null, lighthouse: any, issues: any[] }>}
 */
export async function runLighthouseAudit({
  url,
  instance,
  timeoutMs,
  includeDetails,
  headers,
  hasAuth,
  maxRetries,
  retryDelayMs,
  log,
}) {
  return withRetry(
    async () => {
      const lhRunner = await lighthouse(
        url,
        {
          port: instance.port,
          logLevel: 'silent',
          onlyCategories: ['accessibility'],
          maxWaitForLoad: timeoutMs,
          disableStorageReset: Boolean(hasAuth),
          extraHeaders: headers,
        },
        null
      );

      const lhr = lhRunner?.lhr;
      const score = lhr?.categories?.accessibility?.score;
      const lhScore = typeof score === 'number' ? Math.round(score * 100) : null;

      const failingAudits = Object.entries(lhr?.audits || {})
        .filter(([, a]) => typeof a?.score === 'number' && a.score < 1)
        .map(([id, a]) => ({ id, ...a }));

      const issues = [];
      for (const audit of failingAudits) {
        const normalized = SeverityMapper.normalizeLighthouseAudit(audit, url);
        issues.push(...normalized);
      }

      const lighthouseSection = includeDetails
        ? { score: lhScore, lhr }
        : {
            score: lhScore,
            failingAudits: failingAudits.map((a) => ({
              id: a.id,
              title: a.title,
              description: a.description,
              score: a.score,
            })),
          };

      return {
        lhScore,
        lighthouse: lighthouseSection,
        issues,
      };
    },
    maxRetries,
    retryDelayMs,
    `Lighthouse audit for ${url}`,
    log
  );
}

export default runLighthouseAudit;
