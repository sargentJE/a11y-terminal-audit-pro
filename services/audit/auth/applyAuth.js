import { pathToFileURL } from 'url';
import { normaliseCookies } from './toolAuthOptions.js';

/**
 * Apply authentication to a page.
 *
 * @param {import('puppeteer').Page} page
 * @param {any} auth
 * @param {string} url
 * @param {{ debug: (msg: string) => void, warn: (msg: string) => void }} log
 */
export async function applyAuthentication(page, auth, url, log) {
  const { type, cookies, headers, loginScript, loginCredentials } = auth;

  switch (type) {
    case 'cookies':
      if (cookies && cookies.length > 0) {
        const cookiesWithDefaults = normaliseCookies(cookies, url);
        await page.setCookie(...cookiesWithDefaults);
        log.debug(`Applied ${cookiesWithDefaults.length} authentication cookies`);
      }
      break;

    case 'headers':
      if (headers) {
        await page.setExtraHTTPHeaders(headers);
        log.debug(`Applied ${Object.keys(headers).length} authentication headers`);
      }
      break;

    case 'login-script':
      if (loginScript) {
        try {
          const scriptPath = loginScript.startsWith('/')
            ? loginScript
            : `${process.cwd()}/${loginScript}`;
          const fileUrl = pathToFileURL(scriptPath).href;
          const loginModule = await import(fileUrl);
          const loginFn = loginModule.default || loginModule.login;

          if (typeof loginFn === 'function') {
            await loginFn(page, loginCredentials || {});
            log.debug('Executed authentication login script');
          } else {
            log.warn('Login script does not export a function');
          }
        } catch (err) {
          log.warn(`Failed to execute login script: ${err?.message || err}`);
        }
      }
      break;
    default:
      break;
  }
}

export default applyAuthentication;
