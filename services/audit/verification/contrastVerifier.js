import { createHash } from 'node:crypto';
import { samplePixels, toggleTextVisibility } from './contrast/sampling.js';

const CONFIDENCE_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * @param {string} message
 * @returns {number | null}
 */
function parseThresholdFromMessage(message) {
  const match = String(message || '').match(/(\d+(?:\.\d+)?)\s*:\s*1/);
  const parsed = Number(match?.[1]);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return null;
}

/**
 * @param {string} message
 * @returns {number}
 */
export function extractContrastThreshold(message) {
  return parseThresholdFromMessage(message) ?? 4.5;
}

/**
 * @param {string | number | undefined} size
 * @returns {number}
 */
function parseFontSizePx(size) {
  if (typeof size === 'number' && Number.isFinite(size)) return size;
  const match = String(size || '').match(/(\d+(?:\.\d+)?)px/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {string | number | undefined} weight
 * @returns {number}
 */
function parseFontWeight(weight) {
  if (typeof weight === 'number' && Number.isFinite(weight)) return weight;
  const value = String(weight || '').trim().toLowerCase();
  if (value === 'bold') return 700;
  if (value === 'normal') return 400;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 400;
}

/**
 * WCAG large text threshold:
 * - 18pt (~24px) normal text
 * - 14pt (~18.66px) bold text
 *
 * @param {{ fontSize?: string | number, fontWeight?: string | number }} elementInfo
 * @returns {number}
 */
function thresholdFromTypography(elementInfo) {
  const fontSize = parseFontSizePx(elementInfo?.fontSize);
  const fontWeight = parseFontWeight(elementInfo?.fontWeight);
  const isBold = fontWeight >= 700;

  if (fontSize >= 24 || (isBold && fontSize >= 18.66)) {
    return 3;
  }
  return 4.5;
}

/**
 * @param {string | undefined} value
 * @returns {'low'|'medium'|'high'}
 */
function normalizeConfidenceThreshold(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  return 'high';
}

/**
 * @param {'low'|'medium'|'high'} value
 * @returns {number}
 */
function confidenceRank(value) {
  return CONFIDENCE_ORDER[value] || CONFIDENCE_ORDER.low;
}

/**
 * @param {string} value
 * @returns {[number, number, number] | null}
 */
export function parseColorString(value) {
  const color = String(value || '').trim().toLowerCase();
  if (!color) return null;

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }

  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
  if (!rgbMatch) return null;
  const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((valuePart) => !Number.isFinite(valuePart))) {
    return null;
  }

  return [
    Math.max(0, Math.min(255, Math.round(parts[0]))),
    Math.max(0, Math.min(255, Math.round(parts[1]))),
    Math.max(0, Math.min(255, Math.round(parts[2]))),
  ];
}

/**
 * @param {number} value
 * @returns {number}
 */
function toLinear(value) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {[number, number, number]} colorA
 * @param {[number, number, number]} colorB
 * @returns {number}
 */
export function contrastRatio(colorA, colorB) {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {Array<[number, number, number, number, number?, number?, number?]>} sampledPixels
 * @param {[number, number, number] | null} textRgb
 * @param {number} threshold
 * @param {{ minOpaqueAlpha?: number, minSamples?: number }} [options]
 * @returns {{
 *   status: 'failed'|'passed'|'inconclusive',
 *   minRatio: number|null,
 *   sampleCount: number,
 *   reason: string|null,
 *   reasonCode: string|null,
 *   threshold: number,
 *   confidence: 'low'|'medium'|'high',
 *   transparentCount: number
 * }}
 */
export function analyzeSampledPixels(sampledPixels, textRgb, threshold, options = {}) {
  const minOpaqueAlpha = Number.isFinite(options.minOpaqueAlpha)
    ? Math.max(0, Math.min(1, Number(options.minOpaqueAlpha)))
    : 0.95;
  const minSamples = Number.isFinite(options.minSamples) ? Math.max(1, Number(options.minSamples)) : 16;

  const hasPerSampleTextColor = (sampledPixels || []).some(
    (sample) =>
      Array.isArray(sample) &&
      sample.length >= 7 &&
      Number.isFinite(sample[4]) &&
      Number.isFinite(sample[5]) &&
      Number.isFinite(sample[6])
  );

  if (!textRgb && !hasPerSampleTextColor) {
    return {
      status: 'inconclusive',
      minRatio: null,
      sampleCount: 0,
      reason: 'Could not parse text color for element.',
      reasonCode: 'text-color-unparseable',
      threshold,
      confidence: 'low',
      transparentCount: 0,
    };
  }

  let minRatio = Number.POSITIVE_INFINITY;
  let sampleCount = 0;
  let transparentCount = 0;

  for (const sample of sampledPixels || []) {
    const [r, g, b, alphaRaw, sr, sg, sb] = sample;
    const sampleTextRgb =
      Number.isFinite(sr) && Number.isFinite(sg) && Number.isFinite(sb)
        ? [Number(sr), Number(sg), Number(sb)]
        : textRgb;
    if (!sampleTextRgb) continue;

    const alpha = Number(alphaRaw) / 255;
    if (!Number.isFinite(alpha) || alpha < minOpaqueAlpha) {
      transparentCount++;
      continue;
    }

    sampleCount++;
    const ratio = contrastRatio(sampleTextRgb, [Number(r), Number(g), Number(b)]);
    if (ratio < minRatio) {
      minRatio = ratio;
    }
  }

  if (sampleCount < minSamples || !Number.isFinite(minRatio)) {
    const transparentDominant = transparentCount > sampleCount;
    return {
      status: 'inconclusive',
      minRatio: null,
      sampleCount,
      reason: transparentDominant
        ? 'Layer transparency prevented reliable background sampling.'
        : 'Insufficient usable background pixels were sampled.',
      reasonCode: transparentDominant ? 'transparent-stack-uncertain' : 'insufficient-samples',
      threshold,
      confidence: 'low',
      transparentCount,
    };
  }

  const status = minRatio < threshold ? 'failed' : 'passed';
  const transparencyRatio = transparentCount / Math.max(1, sampleCount + transparentCount);
  const confidence =
    sampleCount >= 100 && transparencyRatio <= 0.15
      ? 'high'
      : sampleCount >= 36
        ? 'medium'
        : 'low';

  return {
    status,
    minRatio: Number(minRatio.toFixed(2)),
    sampleCount,
    reason: null,
    reasonCode: null,
    threshold,
    confidence,
    transparentCount,
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeReasonCode(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * @param {any} issue
 * @param {any} elementInfo
 * @param {number} threshold
 * @param {number} gridSize
 * @param {boolean} deterministic
 * @param {string} method
 * @returns {string}
 */
function buildVerificationInputsHash(issue, elementInfo, threshold, gridSize, deterministic, method) {
  const payload = JSON.stringify({
    ruleCode: issue?.engineMeta?.ruleCode || null,
    selector: issue?.selector || null,
    url: issue?.url || null,
    threshold,
    gridSize,
    deterministic,
    method,
    clip: {
      width: elementInfo?.width ?? null,
      height: elementInfo?.height ?? null,
    },
    typography: {
      color: elementInfo?.textColor || null,
      fontSize: elementInfo?.fontSize || null,
      fontWeight: elementInfo?.fontWeight || null,
    },
    textRectCount: Array.isArray(elementInfo?.textRects) ? elementInfo.textRects.length : 0,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * @param {import('../../../utils/SeverityMapper.js').UnifiedIssue} issue
 * @param {'failed'|'passed'|'inconclusive'} status
 * @param {'low'|'medium'|'high'} confidence
 * @param {'low'|'medium'|'high'} threshold
 * @returns {{
 *   findingKind: 'violation'|'manual-review',
 *   countsTowardCompliance: boolean,
 *   findingCertainty: 'confirmed'|'manual-review'|'inconclusive'|'promoted',
 *   promotionPolicyVersion: string|null
 * }}
 */
function applyPromotionPolicy(issue, status, confidence, threshold) {
  if (status === 'failed' && confidenceRank(confidence) >= confidenceRank(threshold)) {
    return {
      findingKind: 'violation',
      countsTowardCompliance: true,
      findingCertainty: 'promoted',
      promotionPolicyVersion: `contrast-v2:${threshold}`,
    };
  }

  if (status === 'inconclusive') {
    return {
      findingKind: 'manual-review',
      countsTowardCompliance: false,
      findingCertainty: 'inconclusive',
      promotionPolicyVersion: issue?.promotionPolicyVersion || null,
    };
  }

  return {
    findingKind: 'manual-review',
    countsTowardCompliance: false,
    findingCertainty: 'manual-review',
    promotionPolicyVersion: issue?.promotionPolicyVersion || null,
  };
}

/**
 * @param {import('../../../utils/SeverityMapper.js').UnifiedIssue[]} issues
 * @param {{
 *   page: import('puppeteer').Page,
 *   log: { debug: (message: string) => void },
 *   gridSize?: number,
 *   deterministic?: boolean,
 *   confidenceThreshold?: 'low'|'medium'|'high',
 *   v2?: boolean
 * }} params
 * @returns {Promise<import('../../../utils/SeverityMapper.js').UnifiedIssue[]>}
 */
export async function verifyPa11yBackgroundContrast(issues, params) {
  const {
    page,
    log,
    gridSize = 24,
    deterministic = false,
    confidenceThreshold = 'high',
    v2 = true,
  } = params;
  const nextIssues = [];
  const normalizedConfidenceThreshold = normalizeConfidenceThreshold(confidenceThreshold);
  const method = v2 ? 'pixel-sampling-v2' : 'pixel-sampling-v1';

  for (const issue of issues) {
    const ruleCode = String(issue?.engineMeta?.ruleCode || '');
    const shouldVerify = issue.tool === 'pa11y' && ruleCode.includes('BgImage');
    if (!shouldVerify) {
      nextIssues.push(issue);
      continue;
    }

    const explicitThreshold = parseThresholdFromMessage(issue.message);

    if (!issue.selector) {
      nextIssues.push({
        ...issue,
        findingKind: 'manual-review',
        countsTowardCompliance: false,
        findingCertainty: 'inconclusive',
        verification: {
          method,
          status: 'inconclusive',
          threshold: explicitThreshold ?? 4.5,
          minRatio: null,
          sampleCount: 0,
          confidence: 'low',
          reasonCode: 'selector-missing',
          reason: 'Issue selector was missing.',
          inputsHash: null,
          deterministic,
        },
      });
      continue;
    }

    try {
      const elementInfo = await page.$eval(issue.selector, (el) => {
        const rect = el.getBoundingClientRect();
        const style = globalThis.window.getComputedStyle(el);

        /** @type {Array<{ x: number, y: number, width: number, height: number, textColor: string, fontSize: string, fontWeight: string }>} */
        const textRects = [];

        const walker = globalThis.document.createTreeWalker(el, globalThis.NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent || '';
          if (text.trim()) {
            const range = globalThis.document.createRange();
            range.selectNodeContents(node);
            for (const rectPart of Array.from(range.getClientRects())) {
              if (rectPart.width > 0 && rectPart.height > 0) {
                const textStyle =
                  node.parentElement ? globalThis.window.getComputedStyle(node.parentElement) : style;
                textRects.push({
                  x: rectPart.left - rect.left,
                  y: rectPart.top - rect.top,
                  width: rectPart.width,
                  height: rectPart.height,
                  textColor: textStyle.color || style.color || '',
                  fontSize: textStyle.fontSize || style.fontSize || '',
                  fontWeight: textStyle.fontWeight || style.fontWeight || '',
                });
              }
            }
            range.detach?.();
          }
          node = walker.nextNode();
        }

        return {
          x: rect.left + globalThis.window.scrollX,
          y: rect.top + globalThis.window.scrollY,
          width: rect.width,
          height: rect.height,
          textColor: style.color || '',
          fontSize: style.fontSize || '',
          fontWeight: style.fontWeight || '',
          textRects,
        };
      });

      if (!elementInfo || elementInfo.width <= 0 || elementInfo.height <= 0) {
        nextIssues.push({
          ...issue,
          findingKind: 'manual-review',
          countsTowardCompliance: false,
          findingCertainty: 'inconclusive',
          verification: {
            method,
            status: 'inconclusive',
            threshold: explicitThreshold ?? 4.5,
            minRatio: null,
            sampleCount: 0,
            confidence: 'low',
            reasonCode: 'element-not-visible',
            reason: 'Element had no visible layout box.',
            inputsHash: null,
            deterministic,
          },
        });
        continue;
      }

      const textRgb = parseColorString(elementInfo.textColor);
      const resolvedTextRects = (elementInfo.textRects || []).map((rect) => ({
        ...rect,
        textRgb: parseColorString(rect.textColor) || textRgb,
      }));

      const thresholdSource = resolvedTextRects.reduce(
        (best, rect) => {
          const area = Number(rect.width || 0) * Number(rect.height || 0);
          if (area > best.area) {
            return {
              area,
              fontSize: rect.fontSize,
              fontWeight: rect.fontWeight,
            };
          }
          return best;
        },
        { area: -1, fontSize: elementInfo.fontSize, fontWeight: elementInfo.fontWeight }
      );
      const threshold = explicitThreshold ?? thresholdFromTypography(thresholdSource);
      const clip = {
        x: Math.max(0, Math.floor(elementInfo.x)),
        y: Math.max(0, Math.floor(elementInfo.y)),
        width: Math.max(1, Math.floor(elementInfo.width)),
        height: Math.max(1, Math.floor(elementInfo.height)),
      };

      let screenshotBase64 = '';
      if (v2) {
        await toggleTextVisibility(page, issue.selector, true);
      }
      try {
        screenshotBase64 = await page.screenshot({
          type: 'png',
          encoding: 'base64',
          clip,
        });
      } finally {
        if (v2) {
          await toggleTextVisibility(page, issue.selector, false).catch(() => {});
        }
      }

      const sampling = await samplePixels(
        page,
        screenshotBase64,
        gridSize,
        resolvedTextRects,
        textRgb,
        deterministic,
        v2
      );

      const analysis = analyzeSampledPixels(sampling.samples, textRgb, threshold, {
        minSamples: v2 ? 24 : 16,
      });

      const reasonCode = sampling.reasonCode || analysis.reasonCode;
      const reason = sampling.samplingError || analysis.reason;

      const inputsHash = buildVerificationInputsHash(
        issue,
        elementInfo,
        threshold,
        gridSize,
        deterministic,
        method
      );

      const policy = applyPromotionPolicy(
        issue,
        analysis.status,
        analysis.confidence,
        normalizedConfidenceThreshold
      );

      nextIssues.push({
        ...issue,
        findingKind: policy.findingKind,
        countsTowardCompliance: policy.countsTowardCompliance,
        findingCertainty: policy.findingCertainty,
        promotionPolicyVersion: policy.promotionPolicyVersion,
        verification: {
          method,
          status: analysis.status,
          threshold,
          minRatio: analysis.minRatio,
          sampleCount: analysis.sampleCount,
          confidence: analysis.confidence,
          reasonCode,
          reason,
          inputsHash,
          deterministic,
        },
        verificationInputs: [...new Set([...(issue.verificationInputs || []), inputsHash])],
      });
    } catch (error) {
      const reason = error?.message || String(error);
      log.debug(`Contrast verification fallback for ${issue.selector}: ${reason}`);
      nextIssues.push({
        ...issue,
        findingKind: 'manual-review',
        countsTowardCompliance: false,
        findingCertainty: 'inconclusive',
        verification: {
          method,
          status: 'inconclusive',
          threshold: explicitThreshold ?? 4.5,
          minRatio: null,
          sampleCount: 0,
          confidence: 'low',
          reasonCode: normalizeReasonCode('verification-error'),
          reason,
          inputsHash: null,
          deterministic,
        },
      });
    }
  }

  return nextIssues;
}

export default verifyPa11yBackgroundContrast;
