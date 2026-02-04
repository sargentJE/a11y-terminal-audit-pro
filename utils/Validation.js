/**
 * utils/Validation.js
 * -----------------------------------------------------------------------------
 * Central place for validating and normalising user input.
 *
 * In a CLI, predictable input handling is "production-grade" because:
 * - it prevents confusing crashes
 * - it makes error messages actionable
 * - it makes downstream code simpler (it can trust its inputs)
 */

/**
 * @param {string} raw
 * @returns {URL}
 * @throws {Error}
 */
export function parseHttpUrl(raw) {
  // Trim whitespace to be forgiving with copy/paste.
  const value = String(raw || '').trim();

  if (!value) throw new Error('URL is required.');

  // If the user types "example.com" without protocol, assume https.
  const withProto = value.match(/^https?:\/\//i) ? value : `https://${value}`;

  let url;
  try {
    url = new URL(withProto);
  } catch {
    throw new Error(`Invalid URL: "${raw}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  // Normalise: remove trailing hash - it doesn't represent a separate route.
  url.hash = '';

  return url;
}

/**
 * @param {unknown} n
 * @param {object} [opts]
 * @param {number} [opts.min=1]
 * @param {number} [opts.max=500]
 * @param {string} [opts.name='number']
 * @returns {number}
 */
export function toBoundedInt(n, { min = 1, max = 500, name = 'number' } = {}) {
  const parsed = Number(n);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  if (parsed < min) throw new Error(`${name} must be >= ${min}.`);
  if (parsed > max) throw new Error(`${name} must be <= ${max}.`);

  return parsed;
}

/**
 * @param {string} origin
 * @param {string} href
 * @returns {string|null} - Normalised, crawlable URL or null if it should be ignored.
 */
export function normaliseCrawlTarget(origin, href) {
  if (!href) return null;

  // Ignore in-page anchors, mailto/tel, javascript: etc.
  if (href.startsWith('#')) return null;
  if (/^(mailto:|tel:|sms:|javascript:)/i.test(href)) return null;

  let url;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }

  // Only crawl same-origin http(s) URLs.
  if (url.origin !== origin) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Strip hash: a#section is not a new route.
  url.hash = '';

  // Optional: you could strip some tracking params here (utm_*, etc.)
  // We keep query strings by default because they can genuinely represent
  // distinct states on some sites.

  // Use href for a stable string representation.
  return url.href;
}
