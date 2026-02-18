/**
 * services/CrawlerService.js
 * -----------------------------------------------------------------------------
 * Browser-based crawler orchestrator.
 */

import { normaliseCrawlTarget } from '../utils/Validation.js';
import { defaultLogger as log } from '../utils/Logger.js';
import { extractLinksWithPriority } from './crawler/extract/extractLinksWithPriority.js';
import { canonicalUrl, isDisallowed, matchesPatterns } from './crawler/filters/urlFilters.js';
import { probeCommonPaths } from './crawler/discovery/probeCommonPaths.js';
import { loadRobotsTxt } from './crawler/robots/loadRobotsTxt.js';
import { loadSitemap } from './crawler/sitemap/loadSitemap.js';
import { setupSpaDetection } from './crawler/spa/setupSpaDetection.js';
import { popNext, pushCandidate } from './crawler/queue/priorityQueue.js';

/**
 * @typedef {object} CrawlerOptions
 * @property {number} [limit=10]
 * @property {number} [timeoutMs=30000]
 * @property {boolean} [includeQuery=true]
 * @property {object} [config]
 */

export class CrawlerService {
  /**
   * @param {string} baseUrl
   * @param {CrawlerOptions} [opts]
   */
  constructor(baseUrl, opts = {}) {
    this.baseUrl = new URL(baseUrl);
    this.limit = opts.limit ?? 10;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.includeQuery = opts.includeQuery ?? true;

    this.config = {
      useSitemap: opts.config?.useSitemap ?? true,
      respectRobotsTxt: opts.config?.respectRobotsTxt ?? true,
      detectSpaRoutes: opts.config?.detectSpaRoutes ?? true,
      pierceShadowDom: opts.config?.pierceShadowDom ?? true,
      includePatterns: opts.config?.includePatterns ?? [],
      excludePatterns: opts.config?.excludePatterns ?? [],
      discoverCommonPaths: opts.config?.discoverCommonPaths ?? true,
      followNavigation: opts.config?.followNavigation ?? true,
      maxDepth: opts.config?.maxDepth ?? 5,
    };

    /** @type {Map<string, number>} */
    this.urlDepths = new Map();

    /** @type {Set<string>} */
    this.visited = new Set();

    /** @type {Set<string>} */
    this.disallowedPaths = new Set();

    /** @type {Set<string>} */
    this.sitemapUrls = new Set();

    /** @type {Set<string>} */
    this.robotsSitemapUrls = new Set();
  }

  /**
   * Discover internal routes starting from baseUrl (BFS).
   *
   * @param {{ browser: import('puppeteer').Browser, onMsg?: (message: string) => void }} ctx
   * @returns {Promise<string[]>}
   */
  async discoverRoutes(ctx) {
    const { browser, onMsg } = ctx;

    const origin = this.baseUrl.origin;
    const start = this.baseUrl.href;

    const toCanonical = (url) => canonicalUrl(origin, this.includeQuery, url);
    const isBlocked = (url) => isDisallowed(url, this.disallowedPaths);
    const passesPatterns = (url) =>
      matchesPatterns(url, this.config.includePatterns, this.config.excludePatterns);

    if (this.config.respectRobotsTxt) {
      onMsg?.('Checking robots.txt...');
      const robots = await loadRobotsTxt(browser, origin, log);
      this.disallowedPaths = robots.disallowedPaths;
      this.robotsSitemapUrls = robots.sitemapUrls;
    }

    if (this.config.useSitemap) {
      onMsg?.('Parsing sitemaps...');
      this.sitemapUrls = await loadSitemap({
        baseOrigin: origin,
        limit: this.limit,
        robotsSitemapUrls: this.robotsSitemapUrls,
        log,
      });
      onMsg?.(`Found ${this.sitemapUrls.size} URLs in sitemaps`);

      if (this.sitemapUrls.size >= this.limit) {
        const results = [start];
        const seen = new Set([toCanonical(start)]);

        for (const url of this.sitemapUrls) {
          if (results.length >= this.limit) break;

          const canonical = toCanonical(url);
          if (seen.has(canonical)) continue;
          if (isBlocked(canonical)) continue;
          if (!passesPatterns(canonical)) continue;

          results.push(canonical);
          seen.add(canonical);
        }

        onMsg?.(`Using ${results.length} URLs from sitemap`);
        return results;
      }
    }

    /** @type {{ url: string, priority: number, depth: number }[]} */
    const queue = [{ url: start, priority: 0, depth: 0 }];
    this.urlDepths.set(toCanonical(start), 0);

    for (const url of this.sitemapUrls) {
      const canonical = toCanonical(url);
      if (!this.urlDepths.has(canonical)) {
        pushCandidate(queue, { url, priority: 1, depth: 1 });
        this.urlDepths.set(canonical, 1);
      }
    }

    if (this.config.followNavigation) {
      onMsg?.('Priming links from start page...');
      const seedPage = await browser.newPage();
      await seedPage.setCacheEnabled(true);
      await seedPage.setViewport({ width: 1280, height: 800 });

      try {
        await seedPage.goto(start, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
        await seedPage.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => {});

        const seedLinks = await extractLinksWithPriority(seedPage, this.config.pierceShadowDom);
        const seenSeedCandidates = new Set();
        const enqueueSeed = (href, priority) => {
          const normalised = normaliseCrawlTarget(origin, href);
          if (!normalised) return;

          const candidate = toCanonical(normalised);
          if (candidate === toCanonical(start)) return;
          if (seenSeedCandidates.has(candidate)) return;
          if (this.urlDepths.has(candidate)) return;
          if (isBlocked(candidate)) return;
          if (!passesPatterns(candidate)) return;

          pushCandidate(queue, { url: candidate, priority, depth: 1 });
          this.urlDepths.set(candidate, 1);
          seenSeedCandidates.add(candidate);
        };

        for (const href of seedLinks.navigation || []) enqueueSeed(href, 2);
        for (const href of seedLinks.regular || []) enqueueSeed(href, 3);

        if (seenSeedCandidates.size > 0) {
          onMsg?.(`Seeded ${seenSeedCandidates.size} links from start page`);
        }
      } catch (error) {
        log.debug(`Seed link priming skipped for ${start}: ${error?.message || error}`);
      } finally {
        await seedPage.close().catch(() => {});
      }
    }

    const shouldProbeCommonPaths =
      this.config.discoverCommonPaths &&
      (!this.config.followNavigation || queue.length < Math.max(4, this.limit / 2));

    if (shouldProbeCommonPaths) {
      onMsg?.('Probing common page paths...');
      await probeCommonPaths({
        browser,
        baseOrigin: origin,
        baseHref: this.baseUrl.href,
        queue,
        urlDepths: this.urlDepths,
        visited: this.visited,
        limit: this.limit,
        canonicalUrl: toCanonical,
        isDisallowed: isBlocked,
        log,
      });
    }

    onMsg?.(`Starting crawl with ${queue.length} URLs in queue...`);

    const page = await browser.newPage();
    await page.setCacheEnabled(true);
    await page.setViewport({ width: 1280, height: 800 });

    /** @type {Set<string>} */
    const spaRoutes = new Set();

    if (this.config.detectSpaRoutes) {
      await setupSpaDetection(page, spaRoutes, origin);
    }

    try {
      while (queue.length > 0 && this.visited.size < this.limit) {
        const next = popNext(queue);
        if (!next) break;

        const { url: nextUrl, depth: currentDepth } = next;

        if (currentDepth > this.config.maxDepth) {
          log.debug(`Skipping (max depth exceeded): ${nextUrl}`);
          continue;
        }

        const canonical = toCanonical(nextUrl);
        if (this.visited.has(canonical)) continue;

        if (isBlocked(canonical)) {
          log.debug(`Skipping (robots.txt disallowed): ${canonical}`);
          continue;
        }

        if (!passesPatterns(canonical)) {
          log.debug(`Skipping (pattern excluded): ${canonical}`);
          continue;
        }

        try {
          onMsg?.(`Crawling (depth ${currentDepth}): ${canonical}`);
          log.debug(`Crawling ${canonical} at depth ${currentDepth}`);

          await page.goto(canonical, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
          await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});

          this.visited.add(canonical);

          const linkResults = await extractLinksWithPriority(page, this.config.pierceShadowDom);

          for (const route of spaRoutes) {
            const normalised = normaliseCrawlTarget(origin, route);
            if (normalised) {
              linkResults.regular.push(normalised);
            }
          }
          spaRoutes.clear();

          const allLinks = [
            ...linkResults.navigation.map((href) => ({ href, priority: 2 })),
            ...linkResults.regular.map((href) => ({ href, priority: 3 })),
          ];

          for (const { href, priority } of allLinks) {
            const normalised = normaliseCrawlTarget(origin, href);
            if (!normalised) continue;

            const candidate = toCanonical(normalised);
            const newDepth = currentDepth + 1;

            if (
              !this.visited.has(candidate) &&
              !this.urlDepths.has(candidate) &&
              newDepth <= this.config.maxDepth &&
              queue.length + this.visited.size < this.limit * 10
            ) {
              pushCandidate(queue, { url: candidate, priority, depth: newDepth });
              this.urlDepths.set(candidate, newDepth);
            }
          }
        } catch (err) {
          log.warn(`Crawler skip (unreachable): ${canonical} - ${err?.message || err}`);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }

    return Array.from(this.visited);
  }
}

export default CrawlerService;
