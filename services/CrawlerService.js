/**
 * services/CrawlerService.js
 * -----------------------------------------------------------------------------
 * Enhanced "real browser" crawler using Puppeteer.
 *
 * Features:
 * - Sitemap.xml parsing for comprehensive URL discovery
 * - robots.txt respect for polite crawling
 * - SPA route detection via history.pushState interception
 * - Shadow DOM link extraction
 * - Multiple link discovery strategies (a[href], buttons, data attributes)
 * - URL pattern inclusion/exclusion
 *
 * Why a Puppeteer crawler instead of a raw HTML crawler?
 * - Modern sites (React/Vue/Angular) often generate links client-side.
 * - Many internal routes are only discoverable after JS runs.
 * - A browser-based crawl "sees" the site as a user would.
 */

import { normaliseCrawlTarget } from '../utils/Validation.js';
import { defaultLogger as log } from '../utils/Logger.js';

/**
 * @typedef {object} CrawlerConfig
 * @property {boolean} [useSitemap] - Parse sitemap.xml for URLs
 * @property {boolean} [respectRobotsTxt] - Respect robots.txt disallow rules
 * @property {boolean} [detectSpaRoutes] - Monitor history.pushState for SPA routes
 * @property {boolean} [pierceShadowDom] - Scan Shadow DOM elements
 * @property {string[]} [includePatterns] - URL patterns to include (glob)
 * @property {string[]} [excludePatterns] - URL patterns to exclude (glob)
 */

/**
 * @typedef {object} CrawlerOptions
 * @property {number} [limit=10] - Maximum number of pages to discover.
 * @property {number} [timeoutMs=30000] - Navigation timeout.
 * @property {boolean} [includeQuery=true] - Whether to treat query strings as unique routes.
 * @property {CrawlerConfig} [config] - Advanced crawler configuration.
 */

/**
 * @typedef {object} CrawlContext
 * @property {(message: string) => void} [onMsg]
 * @property {import('puppeteer').Browser} browser
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

    // Enhanced configuration
    this.config = {
      useSitemap: opts.config?.useSitemap ?? true,  // Enabled by default for better discovery
      respectRobotsTxt: opts.config?.respectRobotsTxt ?? true,
      detectSpaRoutes: opts.config?.detectSpaRoutes ?? true,  // Enabled by default
      pierceShadowDom: opts.config?.pierceShadowDom ?? true,
      includePatterns: opts.config?.includePatterns ?? [],
      excludePatterns: opts.config?.excludePatterns ?? [],
      discoverCommonPaths: opts.config?.discoverCommonPaths ?? true,  // Try common URLs
      followNavigation: opts.config?.followNavigation ?? true,  // Prioritize nav/footer links
      maxDepth: opts.config?.maxDepth ?? 5,  // Maximum crawl depth from start URL
    };

    /** @type {Map<string, number>} URL -> depth */
    this.urlDepths = new Map();

    /** @type {Set<string>} */
    this.visited = new Set();

    /** @type {Set<string>} */
    this.disallowedPaths = new Set();

    /** @type {Set<string>} */
    this.sitemapUrls = new Set();
  }

  /**
   * Discover internal routes starting from baseUrl (BFS).
   *
   * @param {CrawlContext} ctx
   * @returns {Promise<string[]>}
   */
  async discoverRoutes(ctx) {
    const { browser, onMsg } = ctx;

    const origin = this.baseUrl.origin;
    const start = this.baseUrl.href;

    // Load robots.txt FIRST to get sitemap URLs and disallow rules
    if (this.config.respectRobotsTxt) {
      onMsg?.('Checking robots.txt...');
      await this.#loadRobotsTxt(browser);
    }

    // Load sitemap.xml AFTER robots.txt (to use sitemaps listed there)
    if (this.config.useSitemap) {
      onMsg?.('Parsing sitemaps...');
      await this.#loadSitemap(browser);
      onMsg?.(`Found ${this.sitemapUrls.size} URLs in sitemaps`);
      
      // If sitemap provides enough URLs, use them directly without crawling
      if (this.sitemapUrls.size >= this.limit) {
        // Always include the start URL first
        const startCanonical = this.#canonicalUrl(start);
        const results = [start];
        const seen = new Set([startCanonical]);
        
        for (const url of this.sitemapUrls) {
          if (results.length >= this.limit) break;
          const canonical = this.#canonicalUrl(url);

          if (seen.has(canonical)) continue;
          if (this.#isDisallowed(canonical)) continue;
          if (!this.#matchesPatterns(canonical)) continue;

          results.push(canonical);
          seen.add(canonical);
        }
        
        onMsg?.(`Using ${results.length} URLs from sitemap`);
        return results;
      }
    }

    // BFS queue with priority: navigation links first, then discovered links
    /** @type {{ url: string, priority: number, depth: number }[]} */
    const queue = [{ url: start, priority: 0, depth: 0 }];
    this.urlDepths.set(this.#canonicalUrl(start), 0);

    // Add sitemap URLs to queue (high priority since they're known valid pages)
    for (const url of this.sitemapUrls) {
      const canonical = this.#canonicalUrl(url);
      if (!this.urlDepths.has(canonical)) {
        queue.push({ url, priority: 1, depth: 1 });
        this.urlDepths.set(canonical, 1);
      }
    }

    // Discover common paths if enabled
    if (this.config.discoverCommonPaths) {
      onMsg?.('Probing common page paths...');
      await this.#probeCommonPaths(browser, queue);
    }

    onMsg?.(`Starting crawl with ${queue.length} URLs in queue...`);

    // We reuse a single page for performance. This is typically faster than
    // opening hundreds of tabs.
    const page = await browser.newPage();

    // Helpful defaults for predictable output:
    await page.setCacheEnabled(true);
    await page.setViewport({ width: 1280, height: 800 });

    // Set up SPA route detection if configured
    /** @type {Set<string>} */
    const spaRoutes = new Set();

    if (this.config.detectSpaRoutes) {
      await this.#setupSpaDetection(page, spaRoutes, origin);
    }

    try {
      while (queue.length > 0 && this.visited.size < this.limit) {
        // Sort queue by priority (lower = higher priority)
        queue.sort((a, b) => a.priority - b.priority);
        
        const next = queue.shift();
        if (!next) break;

        const { url: nextUrl, depth: currentDepth } = next;

        // Check max depth
        if (currentDepth > this.config.maxDepth) {
          log.debug(`Skipping (max depth exceeded): ${nextUrl}`);
          continue;
        }

        // Canonicalise: remove hash, optionally remove query.
        const canonical = this.#canonicalUrl(nextUrl);
        if (this.visited.has(canonical)) continue;

        // Check robots.txt disallow rules
        if (this.#isDisallowed(canonical)) {
          log.debug(`Skipping (robots.txt disallowed): ${canonical}`);
          continue;
        }

        // Check include/exclude patterns
        if (!this.#matchesPatterns(canonical)) {
          log.debug(`Skipping (pattern excluded): ${canonical}`);
          continue;
        }

        try {
          onMsg?.(`Crawling (depth ${currentDepth}): ${canonical}`);
          log.debug(`Crawling ${canonical} at depth ${currentDepth}`);

          // Many modern sites never reach full "networkidle0".
          // domcontentloaded + small network-idle window is more robust.
          await page.goto(canonical, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });

          // Wait briefly for client-side routing to settle.
          await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});

          this.visited.add(canonical);

          // Extract links using multiple strategies, with navigation priority
          const linkResults = await this.#extractLinksWithPriority(page);

          // Add any SPA routes discovered during navigation
          for (const route of spaRoutes) {
            const normalised = normaliseCrawlTarget(origin, route);
            if (normalised) {
              linkResults.regular.push(normalised);
            }
          }
          spaRoutes.clear();

          // Process navigation links first (priority 2), then regular links (priority 3)
          const allLinks = [
            ...linkResults.navigation.map(href => ({ href, priority: 2 })),
            ...linkResults.regular.map(href => ({ href, priority: 3 })),
          ];

          for (const { href, priority } of allLinks) {
            const normalised = normaliseCrawlTarget(origin, href);
            if (!normalised) continue;

            const candidate = this.#canonicalUrl(normalised);
            const newDepth = currentDepth + 1;

            // Skip duplicates, check depth, and respect queue size limit
            if (!this.visited.has(candidate) && 
                !this.urlDepths.has(candidate) && 
                newDepth <= this.config.maxDepth &&
                queue.length + this.visited.size < this.limit * 10) {
              queue.push({ url: candidate, priority, depth: newDepth });
              this.urlDepths.set(candidate, newDepth);
            }
          }
        } catch (err) {
          // Crawler should be resilient: unreachable pages should not crash the whole run.
          log.warn(`Crawler skip (unreachable): ${canonical} - ${err?.message || err}`);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }

    return Array.from(this.visited);
  }

  /**
   * Extract links with priority, separating navigation links from regular links.
   * Navigation links (in nav, header, footer) are prioritized for crawling.
   *
   * @private
   * @param {import('puppeteer').Page} page
   * @returns {Promise<{ navigation: string[], regular: string[] }>}
   */
  async #extractLinksWithPriority(page) {
    const pierceShadowDom = this.config.pierceShadowDom;

    const results = await page.evaluate((pierce) => {
      /* global document */
      const navigationLinks = new Set();
      const regularLinks = new Set();

      /**
       * Check if element is within a navigation context
       * @param {Element} el
       * @returns {boolean}
       */
      function isInNavigation(el) {
        let current = el;
        while (current && current !== document.body) {
          const tag = current.tagName?.toLowerCase();
          const role = current.getAttribute?.('role')?.toLowerCase();
          
          if (tag === 'nav' || tag === 'header' || tag === 'footer' ||
              role === 'navigation' || role === 'banner' || role === 'contentinfo' ||
              current.classList?.contains('nav') || current.classList?.contains('navigation') ||
              current.classList?.contains('menu') || current.classList?.contains('header') ||
              current.classList?.contains('footer') || current.id?.includes('nav') ||
              current.id?.includes('menu') || current.id?.includes('header') ||
              current.id?.includes('footer')) {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }

      /**
       * Extract links from a root element
       * @param {Element|ShadowRoot} root
       */
      function extractFromRoot(root) {
        // Standard anchor links
        const anchors = root.querySelectorAll('a[href]');
        anchors.forEach((a) => {
          const href = a.getAttribute('href');
          if (!href) return;
          
          // Skip non-page links
          if (href.startsWith('javascript:') || href.startsWith('mailto:') || 
              href.startsWith('tel:') || href.startsWith('#')) return;

          if (isInNavigation(a)) {
            navigationLinks.add(href);
          } else {
            regularLinks.add(href);
          }
        });

        // Links in <link> elements (alternate pages, canonical, etc.)
        const linkElements = root.querySelectorAll('link[rel="alternate"], link[rel="canonical"], link[href*="/"]');
        linkElements.forEach((link) => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('data:') && !href.includes('.css') && 
              !href.includes('.js') && !href.includes('.ico')) {
            regularLinks.add(href);
          }
        });

        // URLs in JSON-LD structured data
        const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
        jsonLdScripts.forEach((script) => {
          try {
            const data = JSON.parse(script.textContent || '');
            const urlPatterns = ['url', 'mainEntityOfPage', 'sameAs', 'relatedLink', 'hasPart'];
            
            function extractUrls(obj) {
              if (!obj || typeof obj !== 'object') return;
              
              for (const key of Object.keys(obj)) {
                if (urlPatterns.includes(key) && typeof obj[key] === 'string') {
                  regularLinks.add(obj[key]);
                } else if (Array.isArray(obj[key])) {
                  obj[key].forEach(item => {
                    if (typeof item === 'string' && item.startsWith('http')) {
                      regularLinks.add(item);
                    } else {
                      extractUrls(item);
                    }
                  });
                } else if (typeof obj[key] === 'object') {
                  extractUrls(obj[key]);
                }
              }
            }
            extractUrls(data);
          } catch {
            // Ignore JSON parse errors
          }
        });

        // Buttons and elements with onclick/data attributes
        const clickables = root.querySelectorAll('[onclick], button[data-href], [data-link], [data-url]');
        clickables.forEach((el) => {
          const dataHref = el.getAttribute('data-href') || el.getAttribute('data-link') || el.getAttribute('data-url');
          if (dataHref) regularLinks.add(dataHref);

          const onclick = el.getAttribute('onclick');
          if (onclick) {
            const match = onclick.match(/(?:location\.href|window\.location)\s*=\s*['"]([^'"]+)['"]/);
            if (match) regularLinks.add(match[1]);
          }
        });

        // Area elements in image maps
        const areas = root.querySelectorAll('area[href]');
        areas.forEach((a) => {
          const href = a.getAttribute('href');
          if (href) regularLinks.add(href);
        });

        // Look for breadcrumb links (often important pages)
        const breadcrumbs = root.querySelectorAll('[class*="breadcrumb"] a, [aria-label*="breadcrumb"] a, nav[aria-label*="Breadcrumb"] a');
        breadcrumbs.forEach((a) => {
          const href = a.getAttribute('href');
          if (href) navigationLinks.add(href);
        });

        // Pierce Shadow DOM if enabled
        if (pierce) {
          const allElements = root.querySelectorAll('*');
          allElements.forEach((el) => {
            if (el.shadowRoot) {
              extractFromRoot(el.shadowRoot);
            }
          });
        }
      }

      extractFromRoot(document);
      
      return {
        navigation: Array.from(navigationLinks),
        regular: Array.from(regularLinks),
      };
    }, pierceShadowDom);

    return results;
  }

  /**
   * Probe common page paths that many websites have.
   * This helps discover pages that may not be linked from the homepage.
   *
   * @private
   * @param {import('puppeteer').Browser} browser
   * @param {{ url: string, priority: number, depth: number }[]} queue
   */
  async #probeCommonPaths(browser, queue) {
    const commonPaths = [
      // About/Info pages
      '/about', '/about-us', '/about/', '/about-us/',
      '/who-we-are', '/our-story', '/our-team', '/team',
      '/mission', '/vision', '/values',
      
      // Contact pages
      '/contact', '/contact-us', '/contact/', '/contact-us/',
      '/get-in-touch', '/reach-us', '/enquiry', '/enquiries',
      
      // Services/Products
      '/services', '/services/', '/what-we-do',
      '/products', '/products/', '/solutions',
      
      // Resources/Content
      '/blog', '/blog/', '/news', '/news/',
      '/articles', '/resources', '/faqs', '/faq',
      '/help', '/support', '/help-centre', '/help-center',
      
      // Legal/Policy pages
      '/privacy', '/privacy-policy', '/privacy/',
      '/terms', '/terms-of-service', '/terms-and-conditions',
      '/accessibility', '/accessibility-statement',
      '/cookies', '/cookie-policy',
      
      // Common navigation pages
      '/sitemap', '/site-map',
      '/search', '/find',
      '/login', '/signin', '/sign-in', '/register', '/signup', '/sign-up',
      '/account', '/my-account', '/dashboard',
      
      // E-commerce common pages
      '/shop', '/store', '/catalogue', '/catalog',
      '/cart', '/basket', '/checkout',
      '/categories', '/collections',
      
      // Charity/Organisation specific
      '/donate', '/support-us', '/get-involved', '/volunteer',
      '/events', '/whats-on', '/calendar',
      '/membership', '/join', '/become-a-member',
      
      // Information pages
      '/information', '/info', '/guides', '/advice',
      '/conditions', '/symptoms', '/treatments',
    ];

    const page = await browser.newPage();
    page.setDefaultTimeout(5000);

    try {
      for (const path of commonPaths) {
        if (this.visited.size + queue.length >= this.limit * 3) break;

        const testUrl = `${this.baseUrl.origin}${path}`;
        const canonical = this.#canonicalUrl(testUrl);

        if (this.urlDepths.has(canonical)) continue;
        if (this.#isDisallowed(canonical)) continue;

        try {
          const response = await page.goto(testUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 5000 
          });

          // Check if page exists (2xx status) and is HTML
          if (response && response.ok()) {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('text/html')) {
              // Check it's not a redirect to the homepage
              const finalUrl = page.url();
              const finalCanonical = this.#canonicalUrl(finalUrl);
              
              if (finalCanonical !== this.#canonicalUrl(this.baseUrl.href) && 
                  !this.urlDepths.has(finalCanonical)) {
                queue.push({ url: finalCanonical, priority: 1, depth: 1 });
                this.urlDepths.set(finalCanonical, 1);
                log.debug(`Discovered common path: ${finalCanonical}`);
              }
            }
          }
        } catch {
          // Page doesn't exist or timed out, skip silently
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Set up SPA route detection by intercepting history API calls.
   *
   * @private
   * @param {import('puppeteer').Page} page
   * @param {Set<string>} spaRoutes - Set to collect discovered routes
   * @param {string} origin - Site origin
   */
  async #setupSpaDetection(page, spaRoutes, origin) {
    await page.exposeFunction('__a11ySpaRouteDetected', (url) => {
      try {
        const parsed = new URL(url, origin);
        if (parsed.origin === origin) {
          spaRoutes.add(parsed.href);
        }
      } catch {
        // Ignore invalid URLs
      }
    });

    await page.evaluateOnNewDocument(() => {
      /* global history, window */
      // Intercept pushState
      const originalPushState = history.pushState;
      history.pushState = function (...args) {
        const url = args[2];
        if (url) {
          // @ts-ignore - exposed function
          window.__a11ySpaRouteDetected(url.toString());
        }
        return originalPushState.apply(this, args);
      };

      // Intercept replaceState
      const originalReplaceState = history.replaceState;
      history.replaceState = function (...args) {
        const url = args[2];
        if (url) {
          // @ts-ignore - exposed function
          window.__a11ySpaRouteDetected(url.toString());
        }
        return originalReplaceState.apply(this, args);
      };

      // Listen for popstate events
      window.addEventListener('popstate', () => {
        // @ts-ignore - exposed function
        window.__a11ySpaRouteDetected(window.location.href);
      });
    });
  }

  /**
   * Load and parse robots.txt.
   *
   * @private
   * @param {import('puppeteer').Browser} browser
   */
  async #loadRobotsTxt(browser) {
    const robotsUrl = `${this.baseUrl.origin}/robots.txt`;
    const page = await browser.newPage();

    try {
      const response = await page.goto(robotsUrl, { timeout: 10_000 });

      if (response && response.ok()) {
        const content = await response.text();
        this.#parseRobotsTxt(content);
        log.debug(`Loaded robots.txt with ${this.disallowedPaths.size} disallow rules`);
      }
    } catch (err) {
      log.debug(`Could not load robots.txt: ${err?.message || err}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Parse robots.txt content.
   *
   * @private
   * @param {string} content
   */
  #parseRobotsTxt(content) {
    const lines = content.split('\n');
    let relevantSection = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      // Check for user-agent directive
      if (trimmed.startsWith('user-agent:')) {
        const agent = trimmed.substring('user-agent:'.length).trim();
        // We follow rules for * (all agents) or specific crawler agents
        relevantSection = agent === '*' || agent.includes('a11y');
        continue;
      }

      // Parse disallow rules in relevant sections
      if (relevantSection && trimmed.startsWith('disallow:')) {
        const path = line.substring(line.indexOf(':') + 1).trim();
        if (path) {
          this.disallowedPaths.add(path);
        }
      }

      // Also extract sitemap URLs from robots.txt
      if (trimmed.startsWith('sitemap:')) {
        const sitemapUrl = line.substring(line.indexOf(':') + 1).trim();
        if (sitemapUrl) {
          this.robotsSitemapUrls = this.robotsSitemapUrls || new Set();
          this.robotsSitemapUrls.add(sitemapUrl);
        }
      }
    }
  }

  /**
   * Load and parse sitemap.xml (and nested sitemaps).
   * Checks multiple common sitemap locations.
   *
   * @private
   * @param {import('puppeteer').Browser} browser
   */
  async #loadSitemap(browser) {
    // Common sitemap locations to try
    const sitemapLocations = [
      `${this.baseUrl.origin}/sitemap.xml`,
      `${this.baseUrl.origin}/sitemap_index.xml`,
      `${this.baseUrl.origin}/sitemap-index.xml`,
      `${this.baseUrl.origin}/sitemaps.xml`,
      `${this.baseUrl.origin}/sitemap/sitemap.xml`,
      `${this.baseUrl.origin}/wp-sitemap.xml`,  // WordPress
      `${this.baseUrl.origin}/page-sitemap.xml`,
      `${this.baseUrl.origin}/post-sitemap.xml`,
    ];

    // Add any sitemaps found in robots.txt (these are authoritative, so prioritize)
    if (this.robotsSitemapUrls && this.robotsSitemapUrls.size > 0) {
      log.debug(`Found ${this.robotsSitemapUrls.size} sitemaps in robots.txt`);
      for (const url of this.robotsSitemapUrls) {
        if (!sitemapLocations.includes(url)) {
          sitemapLocations.unshift(url);  // Prioritize robots.txt sitemaps
        }
      }
    }

    const visitedSitemaps = new Set();

    // Try each sitemap location
    for (const sitemapUrl of sitemapLocations) {
      if (this.sitemapUrls.size >= this.limit * 2) {
        // Already have enough URLs
        log.debug(`Already have ${this.sitemapUrls.size} URLs, stopping sitemap parsing`);
        break;
      }
      
      try {
        log.debug(`Trying sitemap: ${sitemapUrl}`);
        await this.#parseSitemapUrl(browser, sitemapUrl, 0, visitedSitemaps);
      } catch (err) {
        log.debug(`Sitemap ${sitemapUrl} failed: ${err?.message || err}`);
        // Continue to next sitemap location
      }
    }

    log.debug(`Loaded sitemaps with total ${this.sitemapUrls.size} URLs`);
  }

  /**
   * Parse a single sitemap URL (may contain references to other sitemaps).
   * Handles redirects and sitemap index files.
   *
   * @private
   * @param {import('puppeteer').Browser} browser
   * @param {string} sitemapUrl
   * @param {number} [depth=0]
   * @param {Set<string>} [visitedSitemaps]
   */
  async #parseSitemapUrl(browser, sitemapUrl, depth = 0, visitedSitemaps = new Set()) {
    // Prevent infinite recursion and revisiting same sitemap
    if (depth > 5) return;
    if (visitedSitemaps.has(sitemapUrl)) return;
    visitedSitemaps.add(sitemapUrl);

    try {
      // Use native fetch to get raw XML (avoids browser rendering/XSL transformation issues)
      const response = await fetch(sitemapUrl, {
        headers: {
          'Accept': 'application/xml, text/xml, */*',
          'User-Agent': 'A11Y-Audit-Pro/2.0 Sitemap Parser'
        },
        redirect: 'follow'
      });

      // Track the final URL after redirects
      if (response.url !== sitemapUrl) {
        visitedSitemaps.add(response.url);
        log.debug(`Sitemap redirected: ${sitemapUrl} -> ${response.url}`);
      }

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const content = await response.text();
        log.debug(`Fetched sitemap ${sitemapUrl}: ${content.length} bytes`);

        // Check if it's XML content
        if (contentType.includes('xml') || content.trim().startsWith('<?xml') || content.includes('<urlset') || content.includes('<sitemapindex')) {
          
          // Check if it's a sitemap index (contains nested sitemaps)
          const isSitemapIndex = content.includes('<sitemapindex');
          
          if (isSitemapIndex) {
            // Extract sitemap locations from the index
            const sitemapMatches = [...content.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)];
            log.debug(`Found ${sitemapMatches.length} nested sitemaps in ${sitemapUrl}`);
            for (const match of sitemapMatches) {
              const nestedUrl = match[1].trim();
              await this.#parseSitemapUrl(browser, nestedUrl, depth + 1, visitedSitemaps);
            }
          } else if (content.includes('<urlset')) {
            // This is a URL set sitemap - extract the actual page URLs
            const urlMatches = [...content.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)];
            log.debug(`Found ${urlMatches.length} URLs in ${sitemapUrl}`);
            for (const match of urlMatches) {
              const url = match[1].trim();
              try {
                const parsed = new URL(url);
                // Only add URLs from the same origin
                // Skip only sitemap XML files
                if (parsed.origin === this.baseUrl.origin && !url.match(/sitemap.*\.xml$/i)) {
                  this.sitemapUrls.add(url);
                }
              } catch {
                // Skip invalid URLs
              }
            }
            log.debug(`Total URLs now: ${this.sitemapUrls.size}`);
          }
        }
      } else {
        log.debug(`Sitemap ${sitemapUrl} returned ${response.status}`);
      }
    } catch (err) {
      log.debug(`Could not load sitemap ${sitemapUrl}: ${err?.message || err}`);
    }
  }

  /**
   * Check if a URL is disallowed by robots.txt.
   *
   * @private
   * @param {string} urlStr
   * @returns {boolean}
   */
  #isDisallowed(urlStr) {
    try {
      const url = new URL(urlStr);
      const path = url.pathname;

      for (const disallowed of this.disallowedPaths) {
        // Handle wildcard patterns
        if (disallowed.includes('*')) {
          const regex = new RegExp('^' + disallowed.replace(/\*/g, '.*'));
          if (regex.test(path)) return true;
        } else if (path.startsWith(disallowed)) {
          return true;
        }
      }
    } catch {
      // If URL parsing fails, don't disallow
    }

    return false;
  }

  /**
   * Check if URL matches include/exclude patterns.
   *
   * @private
   * @param {string} urlStr
   * @returns {boolean}
   */
  #matchesPatterns(urlStr) {
    const { includePatterns, excludePatterns } = this.config;

    // If there are exclude patterns, check them first
    if (excludePatterns.length > 0) {
      for (const pattern of excludePatterns) {
        if (this.#matchGlob(urlStr, pattern)) {
          return false;
        }
      }
    }

    // If there are include patterns, URL must match at least one
    if (includePatterns.length > 0) {
      for (const pattern of includePatterns) {
        if (this.#matchGlob(urlStr, pattern)) {
          return true;
        }
      }
      return false;
    }

    // No include patterns means include all (that weren't excluded)
    return true;
  }

  /**
   * Simple glob pattern matching.
   *
   * @private
   * @param {string} str
   * @param {string} pattern
   * @returns {boolean}
   */
  #matchGlob(str, pattern) {
    // Convert glob to regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*')                  // * matches anything
      .replace(/\?/g, '.');                  // ? matches single char

    const regex = new RegExp(regexStr, 'i');
    return regex.test(str);
  }

  /**
   * @private
   * @param {string} urlStr
   */
  #canonicalUrl(urlStr) {
    const u = new URL(urlStr, this.baseUrl.origin);
    u.hash = '';
    if (!this.includeQuery) u.search = '';
    return u.href;
  }
}

export default CrawlerService;
