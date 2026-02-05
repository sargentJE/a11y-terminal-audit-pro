/**
 * Ensure auth cookies include reasonable defaults for domain/path.
 *
 * @param {Array<{name: string, value: string, domain?: string, path?: string}>} cookies
 * @param {string} url
 * @returns {Array<{name: string, value: string, domain?: string, path?: string}>}
 */
export function normaliseCookies(cookies, url) {
  if (!Array.isArray(cookies) || cookies.length === 0) return [];

  const urlObj = new URL(url);
  const defaultDomain = urlObj.hostname;

  return cookies.map((cookie) => ({
    ...cookie,
    domain: cookie.domain || defaultDomain,
    path: cookie.path || '/',
  }));
}

/**
 * Build auth options that can be shared by Lighthouse and Pa11y.
 *
 * @param {any} auth
 * @param {string} url
 * @returns {{ headers: Record<string, string>|undefined, cookies: Array<{name: string, value: string, domain?: string, path?: string}>|undefined }}
 */
export function buildToolAuthOptions(auth, url) {
  if (!auth) {
    return { headers: undefined, cookies: undefined };
  }

  const cookies = auth.type === 'cookies' ? normaliseCookies(auth.cookies || [], url) : undefined;

  const headers = auth.type === 'headers' && auth.headers ? auth.headers : undefined;

  return { headers, cookies };
}

export default buildToolAuthOptions;
