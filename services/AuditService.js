/**
 * services/AuditService.js
 * -----------------------------------------------------------------------------
 * Facade service that orchestrates Lighthouse + axe + Pa11y audits.
 */

import { defaultLogger as log } from '../utils/Logger.js';
import { SeverityMapper } from '../utils/SeverityMapper.js';
import { CodeEvidenceExtractor } from '../utils/CodeEvidenceExtractor.js';
import { applyAuthentication } from './audit/auth/applyAuth.js';
import { buildToolAuthOptions } from './audit/auth/toolAuthOptions.js';
import { deduplicateIssues } from './audit/dedupe/issueDedupe.js';
import { summarizeEvidence } from './audit/evidence/evidenceSummary.js';
import { runLighthouseAudit } from './audit/toolRunners/lighthouseRunner.js';
import { runAxeAudit } from './audit/toolRunners/axeRunner.js';
import { runPa11yAudit } from './audit/toolRunners/pa11yRunner.js';

/** @typedef {{ chrome: any, browser: import('puppeteer').Browser, port: number }} BrowserInstance */
/** @typedef {import('../utils/SeverityMapper.js').UnifiedIssue} UnifiedIssue */

export class AuditService {
  /**
   * Run all audits for a URL and return a unified result object.
   *
   * @param {string} url
   * @param {BrowserInstance} instance
   * @param {object} [opts]
   */
  static async run(url, instance, opts = {}) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const timeoutMs = opts.timeoutMs ?? 60_000;
    const includeDetails = opts.includeDetails ?? false;
    const standard = opts.standard ?? 'WCAG2AA';
    const maxRetries = opts.maxRetries ?? 3;
    const retryDelayMs = opts.retryDelayMs ?? 1000;
    const shouldDeduplicate = opts.deduplicateIssues ?? true;
    const evidenceOptions = {
      enabled: opts.evidence?.enabled ?? true,
      contextLines: opts.evidence?.contextLines ?? 2,
      maxChars: opts.evidence?.maxChars ?? 2000,
      maxOpsPerPage: opts.evidence?.maxOpsPerPage ?? 500,
      timeoutMs: opts.evidence?.timeoutMs ?? 1500,
    };
    const auth = opts.auth;
    const toolAuth = buildToolAuthOptions(auth, url);

    const result = {
      url,
      startedAt,
      durationMs: 0,
      lhScore: null,
      axeViolations: null,
      pa11yIssues: null,
      unifiedIssues: [],
      totalIssues: 0,
      evidenceSummary: null,
      lighthouse: null,
      axe: null,
      pa11y: null,
      errors: {},
    };

    const page = await instance.browser.newPage();
    let pageHtml = '';

    try {
      if (auth) {
        await applyAuthentication(page, auth, url, log);
      }

      /** @type {UnifiedIssue[]} */
      let allIssues = [];
      let evidenceExtractionMs = 0;

      try {
        const lighthouseResult = await runLighthouseAudit({
          url,
          instance,
          timeoutMs,
          includeDetails,
          headers: toolAuth.headers,
          hasAuth: Boolean(auth),
          maxRetries,
          retryDelayMs,
          log,
        });

        result.lhScore = lighthouseResult.lhScore;
        result.lighthouse = lighthouseResult.lighthouse;
        allIssues.push(...lighthouseResult.issues);
      } catch (err) {
        result.errors.lighthouse = { message: err?.message || String(err) };
        log.warn(`Lighthouse failed for ${url}: ${err?.message || err}`);
      }

      try {
        const axeResult = await runAxeAudit({
          url,
          page,
          timeoutMs,
          includeDetails,
          maxRetries,
          retryDelayMs,
          log,
        });

        result.axeViolations = axeResult.axeViolations;
        result.axe = axeResult.axe;
        pageHtml = axeResult.pageHtml;
        allIssues.push(...axeResult.issues);
      } catch (err) {
        result.errors.axe = { message: err?.message || String(err) };
        log.warn(`axe failed for ${url}: ${err?.message || err}`);
      }

      try {
        const pa11yResult = await runPa11yAudit({
          url,
          instance,
          timeoutMs,
          standard,
          includeDetails,
          headers: toolAuth.headers,
          cookies: toolAuth.cookies,
          maxRetries,
          retryDelayMs,
          log,
        });

        result.pa11yIssues = pa11yResult.pa11yIssues;
        result.pa11y = pa11yResult.pa11y;
        allIssues.push(...pa11yResult.issues);
      } catch (err) {
        result.errors.pa11y = { message: err?.message || String(err) };
        log.warn(`Pa11y failed for ${url}: ${err?.message || err}`);
      }

      if (allIssues.length > 0) {
        if (evidenceOptions.enabled && !pageHtml) {
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
            await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});
            pageHtml = await page.content().catch(() => '');
          } catch (error) {
            log.debug(`Code evidence preload failed for ${url}: ${error?.message || error}`);
          }
        }

        const enrichment = await CodeEvidenceExtractor.enrichIssuesWithSummary(allIssues, {
          page,
          sourceHtml: pageHtml,
          options: evidenceOptions,
        });
        allIssues = enrichment.issues;
        evidenceExtractionMs = enrichment.summary.extractionMs;
      }

      if (shouldDeduplicate) {
        allIssues = deduplicateIssues(allIssues);
      }

      allIssues = allIssues.map((issue) => SeverityMapper.withStableFingerprint(issue));

      result.unifiedIssues = allIssues;
      result.totalIssues = allIssues.length;
      result.evidenceSummary = summarizeEvidence(
        allIssues,
        evidenceOptions.enabled,
        evidenceExtractionMs
      );
    } finally {
      await page.close().catch(() => {});
      result.durationMs = Date.now() - t0;
    }

    return result;
  }

  /**
   * Run audits for multiple URLs with configurable concurrency.
   *
   * @param {string[]} urls
   * @param {BrowserInstance} instance
   * @param {object} [opts]
   * @param {(progress: { completed: number, total: number, url: string }) => void} [onProgress]
   * @returns {Promise<Array<Awaited<ReturnType<typeof AuditService.run>>>>}
   */
  static async runBatch(urls, instance, opts = {}, onProgress) {
    const concurrency = opts.concurrency ?? 1;
    const results = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const result = await AuditService.run(url, instance, opts);
          onProgress?.({ completed: results.length + 1, total: urls.length, url });
          return result;
        })
      );

      results.push(...batchResults);
    }

    return results;
  }
}

export default AuditService;
