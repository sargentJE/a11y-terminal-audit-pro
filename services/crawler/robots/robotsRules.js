/**
 * Parse robots.txt content.
 *
 * @param {string} content
 * @returns {{ disallowedPaths: Set<string>, sitemapUrls: Set<string> }}
 */
export function parseRobotsTxt(content) {
  const disallowedPaths = new Set();
  const sitemapUrls = new Set();

  const lines = content.split('\n');
  let relevantSection = false;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();

    if (trimmed.startsWith('user-agent:')) {
      const agent = trimmed.substring('user-agent:'.length).trim();
      relevantSection = agent === '*' || agent.includes('a11y');
      continue;
    }

    if (relevantSection && trimmed.startsWith('disallow:')) {
      const path = line.substring(line.indexOf(':') + 1).trim();
      if (path) disallowedPaths.add(path);
    }

    if (trimmed.startsWith('sitemap:')) {
      const sitemapUrl = line.substring(line.indexOf(':') + 1).trim();
      if (sitemapUrl) sitemapUrls.add(sitemapUrl);
    }
  }

  return { disallowedPaths, sitemapUrls };
}

export default parseRobotsTxt;
