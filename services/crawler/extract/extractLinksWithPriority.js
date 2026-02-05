/**
 * Extract links with priority, separating navigation links from regular links.
 *
 * @param {import('puppeteer').Page} page
 * @param {boolean} pierceShadowDom
 * @returns {Promise<{ navigation: string[], regular: string[] }>}
 */
export async function extractLinksWithPriority(page, pierceShadowDom) {
  return page.evaluate((pierce) => {
    /* global document */
    const navigationLinks = new Set();
    const regularLinks = new Set();

    function isInNavigation(el) {
      let current = el;
      while (current && current !== document.body) {
        const tag = current.tagName?.toLowerCase();
        const role = current.getAttribute?.('role')?.toLowerCase();

        if (
          tag === 'nav' ||
          tag === 'header' ||
          tag === 'footer' ||
          role === 'navigation' ||
          role === 'banner' ||
          role === 'contentinfo' ||
          current.classList?.contains('nav') ||
          current.classList?.contains('navigation') ||
          current.classList?.contains('menu') ||
          current.classList?.contains('header') ||
          current.classList?.contains('footer') ||
          current.id?.includes('nav') ||
          current.id?.includes('menu') ||
          current.id?.includes('header') ||
          current.id?.includes('footer')
        ) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }

    function extractFromRoot(root) {
      const anchors = root.querySelectorAll('a[href]');
      anchors.forEach((a) => {
        const href = a.getAttribute('href');
        if (!href) return;

        if (
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('#')
        ) {
          return;
        }

        if (isInNavigation(a)) navigationLinks.add(href);
        else regularLinks.add(href);
      });

      const linkElements = root.querySelectorAll(
        'link[rel="alternate"], link[rel="canonical"], link[href*="/"]'
      );
      linkElements.forEach((link) => {
        const href = link.getAttribute('href');
        if (
          href &&
          !href.startsWith('data:') &&
          !href.includes('.css') &&
          !href.includes('.js') &&
          !href.includes('.ico')
        ) {
          regularLinks.add(href);
        }
      });

      const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
      jsonLdScripts.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent || '');
          const urlPatterns = ['url', 'mainEntityOfPage', 'sameAs', 'relatedLink', 'hasPart'];

          function extractUrls(obj) {
            if (!obj || typeof obj !== 'object') return;

            for (const key of Object.keys(obj)) {
              if (urlPatterns.includes(key) && typeof obj[key] === 'string') {
                regularLinks.add(obj[key]);
              } else if (Array.isArray(obj[key])) {
                obj[key].forEach((item) => {
                  if (typeof item === 'string' && item.startsWith('http')) {
                    regularLinks.add(item);
                  } else {
                    extractUrls(item);
                  }
                });
              } else if (typeof obj[key] === 'object') {
                extractUrls(obj[key]);
              }
            }
          }
          extractUrls(data);
        } catch {
          // ignore parse errors
        }
      });

      const clickables = root.querySelectorAll('[onclick], button[data-href], [data-link], [data-url]');
      clickables.forEach((el) => {
        const dataHref =
          el.getAttribute('data-href') ||
          el.getAttribute('data-link') ||
          el.getAttribute('data-url');
        if (dataHref) regularLinks.add(dataHref);

        const onclick = el.getAttribute('onclick');
        if (onclick) {
          const match = onclick.match(/(?:location\\.href|window\\.location)\\s*=\\s*['"]([^'"]+)['"]/);
          if (match) regularLinks.add(match[1]);
        }
      });

      const areas = root.querySelectorAll('area[href]');
      areas.forEach((a) => {
        const href = a.getAttribute('href');
        if (href) regularLinks.add(href);
      });

      const breadcrumbs = root.querySelectorAll(
        '[class*="breadcrumb"] a, [aria-label*="breadcrumb"] a, nav[aria-label*="Breadcrumb"] a'
      );
      breadcrumbs.forEach((a) => {
        const href = a.getAttribute('href');
        if (href) navigationLinks.add(href);
      });

      if (pierce) {
        const allElements = root.querySelectorAll('*');
        allElements.forEach((el) => {
          if (el.shadowRoot) {
            extractFromRoot(el.shadowRoot);
          }
        });
      }
    }

    extractFromRoot(document);

    return {
      navigation: Array.from(navigationLinks),
      regular: Array.from(regularLinks),
    };
  }, pierceShadowDom);
}

export default extractLinksWithPriority;
