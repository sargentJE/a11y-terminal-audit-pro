/**
 * Parse a sitemap URL (including nested sitemap indexes).
 *
 * @param {object} params
 * @param {string} params.baseOrigin
 * @param {string} params.sitemapUrl
 * @param {Set<string>} params.sitemapUrls
 * @param {Set<string>} params.visitedSitemaps
 * @param {{ debug: (msg: string) => void }} params.log
 * @param {number} [params.depth=0]
 * @returns {Promise<void>}
 */
export async function parseSitemapUrl({
  baseOrigin,
  sitemapUrl,
  sitemapUrls,
  visitedSitemaps,
  log,
  depth = 0,
}) {
  if (depth > 5) return;
  if (visitedSitemaps.has(sitemapUrl)) return;
  visitedSitemaps.add(sitemapUrl);

  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        Accept: 'application/xml, text/xml, */*',
        'User-Agent': 'A11Y-Audit-Pro/2.0 Sitemap Parser',
      },
      redirect: 'follow',
    });

    if (response.url !== sitemapUrl) {
      visitedSitemaps.add(response.url);
      log.debug(`Sitemap redirected: ${sitemapUrl} -> ${response.url}`);
    }

    if (!response.ok) {
      log.debug(`Sitemap ${sitemapUrl} returned ${response.status}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();
    log.debug(`Fetched sitemap ${sitemapUrl}: ${content.length} bytes`);

    const isXmlLike =
      contentType.includes('xml') ||
      content.trim().startsWith('<?xml') ||
      content.includes('<urlset') ||
      content.includes('<sitemapindex');

    if (!isXmlLike) return;

    if (content.includes('<sitemapindex')) {
      const sitemapMatches = [
        ...content.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g),
      ];
      log.debug(`Found ${sitemapMatches.length} nested sitemaps in ${sitemapUrl}`);
      for (const match of sitemapMatches) {
        const nestedUrl = match[1].trim();
        await parseSitemapUrl({
          baseOrigin,
          sitemapUrl: nestedUrl,
          sitemapUrls,
          visitedSitemaps,
          log,
          depth: depth + 1,
        });
      }
      return;
    }

    if (!content.includes('<urlset')) return;

    const urlMatches = [...content.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)];
    log.debug(`Found ${urlMatches.length} URLs in ${sitemapUrl}`);

    for (const match of urlMatches) {
      const url = match[1].trim();
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseOrigin && !url.match(/sitemap.*\.xml$/i)) {
          sitemapUrls.add(url);
        }
      } catch {
        // ignore invalid urls
      }
    }

    log.debug(`Total URLs now: ${sitemapUrls.size}`);
  } catch (err) {
    log.debug(`Could not load sitemap ${sitemapUrl}: ${err?.message || err}`);
  }
}

export default parseSitemapUrl;
