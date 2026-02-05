/**
 * Set up SPA route detection by intercepting history API calls.
 *
 * @param {import('puppeteer').Page} page
 * @param {Set<string>} spaRoutes
 * @param {string} origin
 */
export async function setupSpaDetection(page, spaRoutes, origin) {
  await page.exposeFunction('__a11ySpaRouteDetected', (url) => {
    try {
      const parsed = new URL(url, origin);
      if (parsed.origin === origin) {
        spaRoutes.add(parsed.href);
      }
    } catch {
      // ignore invalid urls
    }
  });

  await page.evaluateOnNewDocument(() => {
    /* global history, window */
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const url = args[2];
      if (url) {
        // @ts-ignore
        window.__a11ySpaRouteDetected(url.toString());
      }
      return originalPushState.apply(this, args);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const url = args[2];
      if (url) {
        // @ts-ignore
        window.__a11ySpaRouteDetected(url.toString());
      }
      return originalReplaceState.apply(this, args);
    };

    window.addEventListener('popstate', () => {
      // @ts-ignore
      window.__a11ySpaRouteDetected(window.location.href);
    });
  });
}

export default setupSpaDetection;
