import { parseSitemapUrl } from './parseSitemapUrl.js';

/**
 * Load sitemaps from common locations plus robots references.
 *
 * @param {object} params
 * @param {string} params.baseOrigin
 * @param {number} params.limit
 * @param {Set<string>} params.robotsSitemapUrls
 * @param {{ debug: (msg: string) => void }} params.log
 * @returns {Promise<Set<string>>}
 */
export async function loadSitemap({ baseOrigin, limit, robotsSitemapUrls, log }) {
  const sitemapUrls = new Set();
  const visitedSitemaps = new Set();

  const sitemapLocations = [
    `${baseOrigin}/sitemap.xml`,
    `${baseOrigin}/sitemap_index.xml`,
    `${baseOrigin}/sitemap-index.xml`,
    `${baseOrigin}/sitemaps.xml`,
    `${baseOrigin}/sitemap/sitemap.xml`,
    `${baseOrigin}/wp-sitemap.xml`,
    `${baseOrigin}/page-sitemap.xml`,
    `${baseOrigin}/post-sitemap.xml`,
  ];

  if (robotsSitemapUrls && robotsSitemapUrls.size > 0) {
    log.debug(`Found ${robotsSitemapUrls.size} sitemaps in robots.txt`);
    for (const url of robotsSitemapUrls) {
      if (!sitemapLocations.includes(url)) {
        sitemapLocations.unshift(url);
      }
    }
  }

  for (const sitemapUrl of sitemapLocations) {
    if (sitemapUrls.size >= limit * 2) {
      log.debug(`Already have ${sitemapUrls.size} URLs, stopping sitemap parsing`);
      break;
    }

    log.debug(`Trying sitemap: ${sitemapUrl}`);
    await parseSitemapUrl({
      baseOrigin,
      sitemapUrl,
      sitemapUrls,
      visitedSitemaps,
      log,
      depth: 0,
    });
  }

  log.debug(`Loaded sitemaps with total ${sitemapUrls.size} URLs`);
  return sitemapUrls;
}

export default loadSitemap;
