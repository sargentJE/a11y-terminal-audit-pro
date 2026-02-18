/**
 * @param {import('puppeteer').Page} page
 * @param {string} pngBase64
 * @param {number} sampleGridSize
 * @param {Array<{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   textRgb?: [number, number, number] | null
 * }>} textRects
 * @param {[number, number, number] | null} textRgb
 * @param {boolean} deterministic
 * @param {boolean} useTextMask
 * @returns {Promise<{
 *   samples: Array<[number, number, number, number]>,
 *   samplingError: string | null,
 *   reasonCode: string | null
 * }>}
 */
export async function samplePixels(
  page,
  pngBase64,
  sampleGridSize,
  textRects,
  textRgb,
  deterministic,
  useTextMask
) {
  return page.evaluate(
    async ({
      imageBase64,
      gridSize,
      maskRects,
      referenceColor,
      isDeterministic,
      textMaskMode,
      textHiddenMode,
    }) => {
      try {
        const image = new globalThis.Image();
        image.src = `data:image/png;base64,${imageBase64}`;
        await image.decode();

        const canvas = globalThis.document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          return {
            samples: [],
            samplingError: 'Canvas context unavailable.',
            reasonCode: 'sampling-context-unavailable',
          };
        }

        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const samples = [];
        const epsilon = 10;

        const normalizeRect = (rect) => {
          const x = Math.max(0, Math.floor(rect.x || 0));
          const y = Math.max(0, Math.floor(rect.y || 0));
          const maxWidth = canvas.width - x;
          const maxHeight = canvas.height - y;
          const width = Math.max(0, Math.min(Math.ceil(rect.width || 0), maxWidth));
          const height = Math.max(0, Math.min(Math.ceil(rect.height || 0), maxHeight));
          return width > 0 && height > 0
            ? {
                x,
                y,
                width,
                height,
                textRgb: Array.isArray(rect.textRgb) ? rect.textRgb : null,
              }
            : null;
        };

        const rects = textMaskMode
          ? (maskRects || []).map(normalizeRect).filter(Boolean)
          : [{ x: 0, y: 0, width: canvas.width, height: canvas.height }];

        if (rects.length === 0) {
          return {
            samples: [],
            samplingError: 'No text bounding boxes were available for sampling.',
            reasonCode: 'text-mask-failed',
          };
        }

        rects.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        const offsets = isDeterministic
          ? [
              [0, 0],
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
              [-2, 0],
              [2, 0],
              [0, -2],
              [0, 2],
            ]
          : [
              [0, 0],
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ];

        const isNearTextColor = (r, g, b, colorRef) => {
          if (!colorRef || colorRef.length < 3) return false;
          return (
            Math.abs(r - colorRef[0]) <= epsilon &&
            Math.abs(g - colorRef[1]) <= epsilon &&
            Math.abs(b - colorRef[2]) <= epsilon
          );
        };

        for (const rect of rects) {
          const currentTextColor = rect.textRgb || referenceColor || null;
          const xSteps = Math.max(2, Math.round((gridSize * rect.width) / Math.max(1, canvas.width)));
          const ySteps = Math.max(2, Math.round((gridSize * rect.height) / Math.max(1, canvas.height)));

          for (let gy = 0; gy < ySteps; gy++) {
            for (let gx = 0; gx < xSteps; gx++) {
              const x = Math.min(
                canvas.width - 1,
                Math.max(0, Math.round(rect.x + ((gx + 0.5) * rect.width) / xSteps - 0.5))
              );
              const y = Math.min(
                canvas.height - 1,
                Math.max(0, Math.round(rect.y + ((gy + 0.5) * rect.height) / ySteps - 0.5))
              );

              let accepted = null;
              for (const [dx, dy] of offsets) {
                const nx = Math.max(0, Math.min(canvas.width - 1, x + dx));
                const ny = Math.max(0, Math.min(canvas.height - 1, y + dy));
                const offset = (ny * canvas.width + nx) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const a = data[offset + 3];

                if (!textHiddenMode && isNearTextColor(r, g, b, currentTextColor)) continue;
                accepted = [
                  r,
                  g,
                  b,
                  a,
                  currentTextColor?.[0],
                  currentTextColor?.[1],
                  currentTextColor?.[2],
                ];
                break;
              }

              if (accepted) {
                samples.push(accepted);
              }
            }
          }
        }

        return {
          samples,
          samplingError: null,
          reasonCode: null,
        };
      } catch (error) {
        const message = error?.message || String(error);
        const lowered = String(message).toLowerCase();
        return {
          samples: [],
          samplingError: message,
          reasonCode: lowered.includes('tainted') ? 'cross-origin-image-tainted' : 'image-decode-failed',
        };
      }
    },
    {
      imageBase64: pngBase64,
      gridSize: sampleGridSize,
      maskRects: textRects,
      referenceColor: textRgb,
      isDeterministic: deterministic,
      textMaskMode: useTextMask,
      textHiddenMode: useTextMask,
    }
  );
}

/**
 * Temporarily hide descendant text colors for background-only sampling.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {boolean} hidden
 * @returns {Promise<boolean>}
 */
export async function toggleTextVisibility(page, selector, hidden) {
  return page.evaluate(
    ({ targetSelector, shouldHide }) => {
      const root = globalThis.document.querySelector(targetSelector);
      if (!root) return false;

      const marker = 'data-a11y-contrast-inline-style';
      const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
      for (const node of nodes) {
        if (!(node instanceof globalThis.HTMLElement)) continue;

        if (shouldHide) {
          if (!node.hasAttribute(marker)) {
            node.setAttribute(marker, node.getAttribute('style') || '');
          }
          node.style.setProperty('color', 'transparent', 'important');
          node.style.setProperty('text-shadow', 'none', 'important');
          node.style.setProperty('caret-color', 'transparent', 'important');
        } else if (node.hasAttribute(marker)) {
          const previous = node.getAttribute(marker) || '';
          if (previous) {
            node.setAttribute('style', previous);
          } else {
            node.removeAttribute('style');
          }
          node.removeAttribute(marker);
        }
      }

      return true;
    },
    {
      targetSelector: selector,
      shouldHide: hidden,
    }
  );
}
