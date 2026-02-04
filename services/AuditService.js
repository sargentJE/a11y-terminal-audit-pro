/**
 * services/AuditService.js
 * -----------------------------------------------------------------------------
 * Enhanced audit engine that aggregates:
 * - Lighthouse (Accessibility category)
 * - axe-core (via @axe-core/puppeteer)
 * - Pa11y (HTMLCS runner by default)
 *
 * Features:
 * - Retry logic with exponential backoff for transient failures
 * - Parallel audit execution with configurable concurrency
 * - Issue deduplication across tools
 * - Authentication support (cookies, headers, login scripts)
 * - Unified severity scoring and WCAG criteria mapping
 *
 * Output design:
 * - The terminal UI needs *summary metrics* for quick scanning.
 * - The exported JSON should contain enough detail to build dashboards later.
 */

import lighthouse from 'lighthouse';
import { defaultLogger as log } from '../utils/Logger.js';
import { SeverityMapper } from '../utils/SeverityMapper.js';
import { pathToFileURL } from 'url';

/** @typedef {{ chrome: any, browser: import('puppeteer').Browser, port: number }} BrowserInstance */
/** @typedef {import('../utils/SeverityMapper.js').UnifiedIssue} UnifiedIssue */

/**
 * @typedef {object} AuthConfig
 * @property {string} [type] - 'cookies' | 'headers' | 'login-script'
 * @property {Array<{name: string, value: string, domain?: string, path?: string}>} [cookies]
 * @property {Record<string, string>} [headers]
 * @property {string} [loginScript] - Path to login script module
 * @property {Object} [loginCredentials] - Credentials passed to login script
 */

/**
 * @typedef {object} AuditOptions
 * @property {number} [timeoutMs=60000]
 * @property {boolean} [includeDetails=false] - Include full issue lists in JSON.
 * @property {'WCAG2A'|'WCAG2AA'|'WCAG2AAA'|'WCAG21A'|'WCAG21AA'|'WCAG21AAA'|'WCAG22AA'} [standard='WCAG2AA']
 * @property {number} [maxRetries=3] - Maximum retry attempts per tool
 * @property {number} [retryDelayMs=1000] - Base delay for exponential backoff
 * @property {boolean} [deduplicateIssues=true] - Remove duplicate issues across tools
 * @property {AuthConfig} [auth] - Authentication configuration
 */

/**
 * Minimal, JSON-friendly shape for a single axe violation.
 * (The raw axe output can be huge.)
 *
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
      // `target` is an array of selectors.
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary || null,
    })),
  };
}

/**
 * Minimal, JSON-friendly shape for a single Pa11y issue.
 *
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
 * Sleep helper for retry delays.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn - Function to execute
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @param {string} operationName - Name for logging
 * @returns {Promise<T>}
 */
async function withRetry(fn, maxRetries, baseDelay, operationName) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.debug(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export class AuditService {
  /**
   * Run all audits for a URL and return a unified result object.
   *
   * @param {string} url
   * @param {BrowserInstance} instance
   * @param {AuditOptions} [opts]
   */
  static async run(url, instance, opts = {}) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const timeoutMs = opts.timeoutMs ?? 60_000;
    const includeDetails = opts.includeDetails ?? false;
    const standard = opts.standard ?? 'WCAG2AA';
    const maxRetries = opts.maxRetries ?? 3;
    const retryDelayMs = opts.retryDelayMs ?? 1000;
    const deduplicateIssues = opts.deduplicateIssues ?? true;
    const auth = opts.auth;

    const result = {
      url,
      startedAt,
      durationMs: 0,

      // Summary for TUI table:
      lhScore: null,
      axeViolations: null,
      pa11yIssues: null,

      // Unified issues with WCAG mapping
      unifiedIssues: [],
      totalIssues: 0,

      // Detailed sections for exported JSON:
      lighthouse: null,
      axe: null,
      pa11y: null,

      // If any tool fails, we still return a result with error details.
      errors: {},
    };

    // Always create/close a page we control. This prevents leaks and ensures
    // each audit has a clean environment.
    const page = await instance.browser.newPage();

    try {
      // Apply authentication if configured
      if (auth) {
        await AuditService.#applyAuthentication(page, auth, url);
      }

      // Collect all unified issues
      /** @type {UnifiedIssue[]} */
      let allIssues = [];

      // ---------------------------------------------------------------------
      // 1) Lighthouse (Accessibility)
      // ---------------------------------------------------------------------
      try {
        await withRetry(async () => {
          // Lighthouse drives Chrome via the debugging port. It does not require
          // the Puppeteer page above, but sharing the SAME Chrome instance keeps
          // memory use low and avoids extra processes.
          const lhRunner = await lighthouse(
            url,
            {
              port: instance.port,
              logLevel: 'silent',
              onlyCategories: ['accessibility'],
              // Keep Lighthouse from waiting forever on very "chatty" SPAs:
              maxWaitForLoad: timeoutMs,
            },
            // Config can be customised later; default is fine for now.
            null
          );

          const lhr = lhRunner?.lhr;
          const score = lhr?.categories?.accessibility?.score;

          result.lhScore = typeof score === 'number' ? Math.round(score * 100) : null;

          // Normalize Lighthouse issues to unified format
          const failingAudits = Object.entries(lhr?.audits || {})
            .filter(([, a]) => typeof a?.score === 'number' && a.score < 1)
            .map(([id, a]) => ({ id, ...a }));

          for (const audit of failingAudits) {
            const normalized = SeverityMapper.normalizeLighthouseAudit(audit, url);
            allIssues.push(...normalized);
          }

          // Keep the exported JSON reasonably sized:
          result.lighthouse = includeDetails
            ? { score: result.lhScore, lhr }
            : {
                score: result.lhScore,
                // Include just failing audits (score < 1) as an actionable summary.
                failingAudits: failingAudits.map((a) => ({
                  id: a.id,
                  title: a.title,
                  description: a.description,
                  score: a.score,
                })),
              };
        }, maxRetries, retryDelayMs, `Lighthouse audit for ${url}`);
      } catch (err) {
        result.errors.lighthouse = { message: err?.message || String(err) };
        log.warn(`Lighthouse failed for ${url}: ${err?.message || err}`);
      }

      // ---------------------------------------------------------------------
      // 2) axe-core (via Puppeteer)
      // ---------------------------------------------------------------------
      try {
        await withRetry(async () => {
          // Navigate the Puppeteer page so axe scans the rendered DOM.
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});

          const axeMod = await import('@axe-core/puppeteer');
          const { AxePuppeteer } = axeMod;

          const axeResults = await new AxePuppeteer(page).analyze();

          const violations = axeResults?.violations || [];
          result.axeViolations = violations.length;

          // Normalize axe violations to unified format
          for (const violation of violations) {
            const normalized = SeverityMapper.normalizeAxeViolation(violation, url);
            allIssues.push(...normalized);
          }

          result.axe = includeDetails
            ? axeResults
            : {
                violationsCount: violations.length,
                violations: violations.map((v) => reduceAxeViolation(v)),
              };
        }, maxRetries, retryDelayMs, `axe audit for ${url}`);
      } catch (err) {
        result.errors.axe = { message: err?.message || String(err) };
        log.warn(`axe failed for ${url}: ${err?.message || err}`);
      }

      // ---------------------------------------------------------------------
      // 3) Pa11y (HTMLCS by default)
      // ---------------------------------------------------------------------
      try {
        await withRetry(async () => {
          const pa11yMod = await import('pa11y');
          const pa11y = pa11yMod.default || pa11yMod;

          // Pa11y can reuse an existing Puppeteer browser instance. This avoids
          // launching yet another Chromium process per URL.
          const pa11yResults = await pa11y(url, {
            browser: instance.browser,
            timeout: timeoutMs,
            standard,
            // We already run axe separately, so we keep Pa11y focused on HTMLCS.
            // (If you want both, set runners: ['htmlcs', 'axe'].)
            runners: ['htmlcs'],
            includeNotices: false,
            includeWarnings: true,
          });

          const issues = pa11yResults?.issues || [];
          result.pa11yIssues = issues.length;

          // Normalize Pa11y issues to unified format
          for (const issue of issues) {
            const normalized = SeverityMapper.normalizePa11yIssue(issue, url);
            allIssues.push(normalized);
          }

          result.pa11y = includeDetails
            ? pa11yResults
            : {
                issuesCount: issues.length,
                issues: issues.slice(0, 200).map(reducePa11yIssue),
              };
        }, maxRetries, retryDelayMs, `Pa11y audit for ${url}`);
      } catch (err) {
        result.errors.pa11y = { message: err?.message || String(err) };
        log.warn(`Pa11y failed for ${url}: ${err?.message || err}`);
      }

      // Deduplicate issues if enabled
      if (deduplicateIssues) {
        allIssues = AuditService.#deduplicateIssues(allIssues);
      }

      result.unifiedIssues = allIssues;
      result.totalIssues = allIssues.length;

    } finally {
      await page.close().catch(() => {});
      result.durationMs = Date.now() - t0;
    }

    return result;
  }

  /**
   * Run audits for multiple URLs with configurable concurrency.
   *
   * @param {string[]} urls - URLs to audit
   * @param {BrowserInstance} instance
   * @param {AuditOptions & { concurrency?: number }} [opts]
   * @param {(progress: { completed: number, total: number, url: string }) => void} [onProgress]
   * @returns {Promise<Array<ReturnType<typeof AuditService.run>>>}
   */
  static async runBatch(urls, instance, opts = {}, onProgress) {
    const concurrency = opts.concurrency ?? 1;
    const results = [];

    // Process URLs in batches based on concurrency
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

  /**
   * Apply authentication to a page.
   *
   * @private
   * @param {import('puppeteer').Page} page
   * @param {AuthConfig} auth
   * @param {string} url
   */
  static async #applyAuthentication(page, auth, url) {
    const { type, cookies, headers, loginScript, loginCredentials } = auth;

    switch (type) {
      case 'cookies':
        if (cookies && cookies.length > 0) {
          // Extract domain from URL if not specified
          const urlObj = new URL(url);
          const defaultDomain = urlObj.hostname;

          const cookiesWithDefaults = cookies.map((cookie) => ({
            ...cookie,
            domain: cookie.domain || defaultDomain,
            path: cookie.path || '/',
          }));

          await page.setCookie(...cookiesWithDefaults);
          log.debug(`Applied ${cookiesWithDefaults.length} authentication cookies`);
        }
        break;

      case 'headers':
        if (headers) {
          await page.setExtraHTTPHeaders(headers);
          log.debug(`Applied ${Object.keys(headers).length} authentication headers`);
        }
        break;

      case 'login-script':
        if (loginScript) {
          try {
            // Import the login script module
            const scriptPath = loginScript.startsWith('/')
              ? loginScript
              : `${process.cwd()}/${loginScript}`;
            const fileUrl = pathToFileURL(scriptPath).href;
            const loginModule = await import(fileUrl);
            const loginFn = loginModule.default || loginModule.login;

            if (typeof loginFn === 'function') {
              await loginFn(page, loginCredentials || {});
              log.debug('Executed authentication login script');
            } else {
              log.warn('Login script does not export a function');
            }
          } catch (err) {
            log.warn(`Failed to execute login script: ${err?.message || err}`);
          }
        }
        break;

      default:
        // No authentication
        break;
    }
  }

  /**
   * Deduplicate issues across tools by CSS selector and rule type.
   *
   * @private
   * @param {UnifiedIssue[]} issues
   * @returns {UnifiedIssue[]}
   */
  static #deduplicateIssues(issues) {
    /** @type {Map<string, UnifiedIssue>} */
    const uniqueIssues = new Map();

    for (const issue of issues) {
      // Create a deduplication key based on selector and WCAG criteria
      const wcagIds = (issue.wcagCriteria || []).map((c) => c.id).sort().join(',');
      const key = `${issue.selector || 'no-selector'}::${wcagIds || issue.message.substring(0, 50)}`;

      if (!uniqueIssues.has(key)) {
        uniqueIssues.set(key, issue);
      } else {
        // Keep the issue with higher severity
        const existing = uniqueIssues.get(key);
        if (issue.severity < existing.severity) {
          uniqueIssues.set(key, issue);
        }
      }
    }

    return Array.from(uniqueIssues.values());
  }
}

export default AuditService;
