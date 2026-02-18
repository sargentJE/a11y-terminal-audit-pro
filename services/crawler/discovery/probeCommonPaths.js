/**
 * Probe common page paths that many websites have.
 *
 * @param {object} params
 * @param {import('puppeteer').Browser} params.browser
 * @param {string} params.baseOrigin
 * @param {string} params.baseHref
 * @param {{ url: string, priority: number, depth: number }[]} params.queue
 * @param {Map<string, number>} params.urlDepths
 * @param {Set<string>} params.visited
 * @param {number} params.limit
 * @param {(url: string) => string} params.canonicalUrl
 * @param {(url: string) => boolean} params.isDisallowed
 * @param {{ debug: (msg: string) => void }} params.log
 */
export async function probeCommonPaths({
  browser,
  baseOrigin,
  baseHref,
  queue,
  urlDepths,
  visited,
  limit,
  canonicalUrl,
  isDisallowed,
  log,
}) {
  const isLikelyNotFoundText = (value) =>
    /\b(404|not found|page not found|cannot be found|does not exist|doesn't exist|unavailable)\b/i.test(
      String(value || '')
    );

  const commonPaths = [
    '/about',
    '/about-us',
    '/about/',
    '/about-us/',
    '/who-we-are',
    '/our-story',
    '/our-team',
    '/team',
    '/mission',
    '/vision',
    '/values',
    '/contact',
    '/contact-us',
    '/contact/',
    '/contact-us/',
    '/get-in-touch',
    '/reach-us',
    '/enquiry',
    '/enquiries',
    '/services',
    '/services/',
    '/what-we-do',
    '/products',
    '/products/',
    '/solutions',
    '/blog',
    '/blog/',
    '/news',
    '/news/',
    '/articles',
    '/resources',
    '/faqs',
    '/faq',
    '/help',
    '/support',
    '/help-centre',
    '/help-center',
    '/privacy',
    '/privacy-policy',
    '/privacy/',
    '/terms',
    '/terms-of-service',
    '/terms-and-conditions',
    '/accessibility',
    '/accessibility-statement',
    '/cookies',
    '/cookie-policy',
    '/sitemap',
    '/site-map',
    '/search',
    '/find',
    '/login',
    '/signin',
    '/sign-in',
    '/register',
    '/signup',
    '/sign-up',
    '/account',
    '/my-account',
    '/dashboard',
    '/shop',
    '/store',
    '/catalogue',
    '/catalog',
    '/cart',
    '/basket',
    '/checkout',
    '/categories',
    '/collections',
    '/donate',
    '/support-us',
    '/get-involved',
    '/volunteer',
    '/events',
    '/whats-on',
    '/calendar',
    '/membership',
    '/join',
    '/become-a-member',
    '/information',
    '/info',
    '/guides',
    '/advice',
    '/conditions',
    '/symptoms',
    '/treatments',
  ];

  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let discoveredCount = 0;
  const maxDiscoveredCandidates = Math.max(3, Math.min(limit, 8));

  try {
    for (const path of commonPaths) {
      if (visited.size + queue.length >= limit * 2) break;
      if (discoveredCount >= maxDiscoveredCandidates) break;

      const testUrl = `${baseOrigin}${path}`;
      const canonical = canonicalUrl(testUrl);

      if (urlDepths.has(canonical)) continue;
      if (isDisallowed(canonical)) continue;

      try {
        const response = await page.goto(testUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });

        if (response && response.ok()) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('text/html')) {
            const finalUrl = page.url();
            const finalCanonical = canonicalUrl(finalUrl);

            const signals = await page
              .evaluate(() => {
                const title = globalThis.document.title || '';
                const h1 = globalThis.document.querySelector('h1')?.textContent || '';
                const bodyText = (globalThis.document.body?.innerText || '').replace(/\s+/g, ' ').trim();
                return {
                  title,
                  h1,
                  bodyText: bodyText.slice(0, 1200),
                  bodyLength: bodyText.length,
                };
              })
              .catch(() => null);

            if (signals) {
              const notFoundSignal =
                isLikelyNotFoundText(signals.title) ||
                isLikelyNotFoundText(signals.h1) ||
                (signals.bodyLength < 1400 && isLikelyNotFoundText(signals.bodyText));

              if (notFoundSignal) {
                log.debug(`Skipping likely soft-404 common path: ${finalCanonical}`);
                continue;
              }
            }

            if (finalCanonical !== canonicalUrl(baseHref) && !urlDepths.has(finalCanonical)) {
              queue.push({ url: finalCanonical, priority: 5, depth: 2 });
              urlDepths.set(finalCanonical, 2);
              discoveredCount++;
              log.debug(`Discovered common path: ${finalCanonical}`);
            }
          }
        }
      } catch {
        // skip unavailable path
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

export default probeCommonPaths;
