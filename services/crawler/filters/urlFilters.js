/**
 * @param {string} rule
 * @returns {RegExp}
 */
export function wildcardRobotsRuleToRegex(rule) {
  const regexRule = rule.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${regexRule}`);
}

/**
 * @param {string} urlStr
 * @param {Set<string>} disallowedPaths
 * @returns {boolean}
 */
export function isDisallowed(urlStr, disallowedPaths) {
  try {
    const url = new URL(urlStr);
    const path = url.pathname;
    const pathWithQuery = `${url.pathname}${url.search}`;

    for (const disallowed of disallowedPaths) {
      if (disallowed.includes('*')) {
        const regex = wildcardRobotsRuleToRegex(disallowed);
        if (regex.test(pathWithQuery)) return true;
      } else if (disallowed.includes('?')) {
        if (pathWithQuery.startsWith(disallowed)) return true;
      } else if (path.startsWith(disallowed)) {
        return true;
      }
    }
  } catch {
    // noop
  }

  return false;
}

/**
 * @param {string} str
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchGlob(str, pattern) {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(regexStr, 'i');
  return regex.test(str);
}

/**
 * @param {string} urlStr
 * @param {string[]} includePatterns
 * @param {string[]} excludePatterns
 * @returns {boolean}
 */
export function matchesPatterns(urlStr, includePatterns, excludePatterns) {
  if (excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchGlob(urlStr, pattern)) return false;
    }
  }

  if (includePatterns.length > 0) {
    for (const pattern of includePatterns) {
      if (matchGlob(urlStr, pattern)) return true;
    }
    return false;
  }

  return true;
}

/**
 * @param {string} origin
 * @param {boolean} includeQuery
 * @param {string} urlStr
 * @returns {string}
 */
export function canonicalUrl(origin, includeQuery, urlStr) {
  const u = new URL(urlStr, origin);
  u.hash = '';
  if (!includeQuery) u.search = '';
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }
  return u.href;
}
