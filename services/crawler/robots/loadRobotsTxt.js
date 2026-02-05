import { parseRobotsTxt } from './robotsRules.js';

/**
 * Load and parse robots.txt for a site origin.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} origin
 * @param {{ debug: (msg: string) => void }} log
 * @returns {Promise<{ disallowedPaths: Set<string>, sitemapUrls: Set<string> }>}
 */
export async function loadRobotsTxt(browser, origin, log) {
  const robotsUrl = `${origin}/robots.txt`;
  const page = await browser.newPage();

  try {
    const response = await page.goto(robotsUrl, { timeout: 10_000 });
    if (response && response.ok()) {
      const content = await response.text();
      const parsed = parseRobotsTxt(content);
      log.debug(`Loaded robots.txt with ${parsed.disallowedPaths.size} disallow rules`);
      return parsed;
    }
  } catch (err) {
    log.debug(`Could not load robots.txt: ${err?.message || err}`);
  } finally {
    await page.close().catch(() => {});
  }

  return { disallowedPaths: new Set(), sitemapUrls: new Set() };
}

export default loadRobotsTxt;
