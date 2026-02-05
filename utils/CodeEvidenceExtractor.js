/**
 * utils/CodeEvidenceExtractor.js
 * -----------------------------------------------------------------------------
 * Enriches normalized accessibility issues with code evidence pulled from:
 * 1) Runtime DOM (high confidence)
 * 2) Source HTML matching (medium confidence)
 * 3) Tool-provided context fallback (low confidence)
 */

import { defaultLogger as log } from './Logger.js';

/** @typedef {import('./SeverityMapper.js').UnifiedIssue} UnifiedIssue */
/** @typedef {import('./SeverityMapper.js').IssueEvidence} IssueEvidence */
/**
 * @typedef {object} EvidenceExtractionSummary
 * @property {boolean} enabled
 * @property {number} totalIssues
 * @property {number} high
 * @property {number} medium
 * @property {number} low
 * @property {number} unresolved
 * @property {number} extractionMs
 */

const DEFAULT_OPTIONS = {
  enabled: true,
  contextLines: 2,
  maxChars: 2000,
  maxOpsPerPage: 500,
  timeoutMs: 1500,
};

const SECRET_KEY_REGEX_SRC = [
  'access[_-]?token',
  'id[_-]?token',
  'refresh[_-]?token',
  'api[_-]?key',
  'apikey',
  'jwt',
  'token',
  'authorization',
  'auth',
  'password',
  'secret',
  'session',
  'cookie',
].join('|');

/**
 * @param {Promise<any>} promise
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} snippet
 * @param {number} maxChars
 * @returns {string}
 */
function truncate(snippet, maxChars) {
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars)}…`;
}

/**
 * @param {string} snippet
 * @returns {string}
 */
function redactSensitive(snippet) {
  if (!snippet) return snippet;

  return snippet
    .replace(
      new RegExp(`\\b(${SECRET_KEY_REGEX_SRC})(\\s*=\\s*)(["']).*?\\3`, 'gi'),
      '$1$2$3[REDACTED]$3'
    )
    .replace(
      new RegExp(`\\b(${SECRET_KEY_REGEX_SRC})(\\s*:\\s*)(["']).*?\\3`, 'gi'),
      '$1$2$3[REDACTED]$3'
    )
    .replace(
      new RegExp(`\\b(${SECRET_KEY_REGEX_SRC})(\\s*=\\s*)([^\\s"'\\x60>]+)`, 'gi'),
      '$1$2[REDACTED]'
    )
    .replace(
      new RegExp(`([?&](?:${SECRET_KEY_REGEX_SRC})=)([^&#\\s]+)`, 'gi'),
      '$1[REDACTED]'
    )
    .replace(
      /(bearer\s+)[a-z0-9._~+/-]+=*/gi,
      '$1[REDACTED]'
    )
    .replace(
      /\b(set-cookie|cookie)(\s*:\s*[^=;\s]+\s*=)([^;\s]+)/gi,
      '$1$2[REDACTED]'
    );
}

/**
 * @param {string} sourceHtml
 * @param {number} matchIndex
 * @param {number} matchLength
 * @param {number} contextLines
 * @returns {{ line: number, column: number, contextBefore: string, contextAfter: string, snippet: string }}
 */
function extractLineContext(sourceHtml, matchIndex, matchLength, contextLines) {
  const prefix = sourceHtml.slice(0, matchIndex);
  const line = prefix.split('\n').length;
  const lastNewlineIdx = prefix.lastIndexOf('\n');
  const column = lastNewlineIdx === -1 ? prefix.length + 1 : prefix.length - lastNewlineIdx;

  const lines = sourceHtml.split('\n');
  const lineIdx = Math.max(0, line - 1);
  const beforeStart = Math.max(0, lineIdx - contextLines);
  const afterEnd = Math.min(lines.length, lineIdx + contextLines + 1);

  const contextBefore = lines.slice(beforeStart, lineIdx).join('\n');
  const contextAfter = lines.slice(lineIdx + 1, afterEnd).join('\n');
  const snippet = sourceHtml.slice(matchIndex, matchIndex + matchLength);

  return { line, column, contextBefore, contextAfter, snippet };
}

/**
 * @param {string} sourceHtml
 * @param {string} candidate
 * @returns {{ index: number, length: number } | null}
 */
function findInSource(sourceHtml, candidate) {
  if (!candidate) return null;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const exactIdx = sourceHtml.indexOf(trimmed);
  if (exactIdx >= 0) {
    return { index: exactIdx, length: trimmed.length };
  }

  // Fall back to whitespace-tolerant matching for tool snippets.
  if (trimmed.length > 600) return null;
  const pattern = escapeRegex(trimmed).replace(/\s+/g, '\\s+');
  const regex = new RegExp(pattern, 'i');
  const match = regex.exec(sourceHtml);
  if (!match || match.index < 0) return null;

  return { index: match.index, length: match[0].length };
}

/**
 * @param {UnifiedIssue} issue
 * @returns {IssueEvidence}
 */
function buildFallbackEvidence(issue) {
  const fallbackSnippet = issue.html || issue.message || '';

  return {
    snippet: fallbackSnippet,
    source: 'tool-context',
    confidence: 'low',
    locator: {
      selector: issue.selector || null,
      xpath: null,
      line: null,
      column: null,
    },
    captureError: 'Unable to resolve exact DOM/source snippet',
  };
}

export class CodeEvidenceExtractor {
  /**
   * Enrich unified issues with code evidence.
   *
   * @param {UnifiedIssue[]} issues
   * @param {object} [ctx]
   * @param {import('puppeteer').Page} [ctx.page]
   * @param {string} [ctx.sourceHtml]
   * @param {Partial<typeof DEFAULT_OPTIONS>} [ctx.options]
   * @returns {Promise<UnifiedIssue[]>}
   */
  static async enrichIssues(issues, ctx = {}) {
    const { issues: enriched } = await CodeEvidenceExtractor.enrichIssuesWithSummary(issues, ctx);
    return enriched;
  }

  /**
   * Enrich unified issues and return extraction telemetry summary.
   *
   * @param {UnifiedIssue[]} issues
   * @param {object} [ctx]
   * @param {import('puppeteer').Page} [ctx.page]
   * @param {string} [ctx.sourceHtml]
   * @param {Partial<typeof DEFAULT_OPTIONS>} [ctx.options]
   * @returns {Promise<{ issues: UnifiedIssue[], summary: EvidenceExtractionSummary }>}
   */
  static async enrichIssuesWithSummary(issues, ctx = {}) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return {
        issues: Array.isArray(issues) ? issues : [],
        summary: {
          enabled: Boolean(ctx.options?.enabled ?? DEFAULT_OPTIONS.enabled),
          totalIssues: 0,
          high: 0,
          medium: 0,
          low: 0,
          unresolved: 0,
          extractionMs: 0,
        },
      };
    }

    const startedAt = Date.now();
    const options = { ...DEFAULT_OPTIONS, ...(ctx.options || {}) };
    if (!options.enabled) {
      return {
        issues,
        summary: {
          enabled: false,
          totalIssues: issues.length,
          high: 0,
          medium: 0,
          low: 0,
          unresolved: 0,
          extractionMs: 0,
        },
      };
    }

    const page = ctx.page;
    let sourceHtml = typeof ctx.sourceHtml === 'string' ? ctx.sourceHtml : '';

    if (!sourceHtml && page?.content) {
      try {
        sourceHtml = await withTimeout(page.content(), options.timeoutMs);
      } catch (error) {
        log.debug(`Code evidence: could not read page source (${error?.message || error})`);
      }
    }

    const selectorCache = new Map();
    const operationState = { count: 0 };
    const enriched = [];

    for (const issue of issues) {
      const evidence = await CodeEvidenceExtractor.#extractIssueEvidence({
        issue,
        page,
        sourceHtml,
        options,
        selectorCache,
        operationState,
      });

      if (!evidence) {
        enriched.push(issue);
        continue;
      }

      enriched.push({
        ...issue,
        evidence: {
          ...evidence,
          snippet: truncate(redactSensitive(evidence.snippet || ''), options.maxChars),
          contextBefore: truncate(redactSensitive(evidence.contextBefore || ''), options.maxChars),
          contextAfter: truncate(redactSensitive(evidence.contextAfter || ''), options.maxChars),
        },
      });
    }

    const summary = {
      enabled: true,
      totalIssues: enriched.length,
      high: 0,
      medium: 0,
      low: 0,
      unresolved: 0,
      extractionMs: Date.now() - startedAt,
    };

    for (const issue of enriched) {
      const confidence = issue.evidence?.confidence || 'low';
      if (confidence === 'high') summary.high += 1;
      else if (confidence === 'medium') summary.medium += 1;
      else summary.low += 1;

      if (issue.evidence?.source === 'tool-context' || issue.evidence?.captureError) {
        summary.unresolved += 1;
      }
    }

    return { issues: enriched, summary };
  }

  /**
   * @private
   * @param {object} params
   * @param {UnifiedIssue} params.issue
   * @param {import('puppeteer').Page|undefined} params.page
   * @param {string} params.sourceHtml
   * @param {typeof DEFAULT_OPTIONS} params.options
   * @param {Map<string, any>} params.selectorCache
   * @param {{ count: number }} params.operationState
   * @returns {Promise<IssueEvidence>}
   */
  static async #extractIssueEvidence(params) {
    const { issue, page, sourceHtml, options, selectorCache, operationState } = params;
    const selector = (issue.selector || '').trim();
    const errors = [];

    if (page && selector && operationState.count < options.maxOpsPerPage) {
      let selectorMatch = selectorCache.get(selector);
      if (!selectorMatch) {
        operationState.count += 1;
        try {
          selectorMatch = await withTimeout(
            page.evaluate((selectorValue) => {
              /* global document */
              try {
                const el = document.querySelector(selectorValue);
                if (!el) return { found: false };

                const segments = [];
                let current = el;
                while (current && current.nodeType === 1) {
                  let position = 1;
                  let sibling = current.previousElementSibling;
                  while (sibling) {
                    if (sibling.tagName === current.tagName) position += 1;
                    sibling = sibling.previousElementSibling;
                  }
                  segments.unshift(`${current.tagName.toLowerCase()}[${position}]`);
                  current = current.parentElement;
                }

                return {
                  found: true,
                  snippet: el.outerHTML || '',
                  xpath: `/${segments.join('/')}`,
                };
              } catch (error) {
                return { found: false, error: error?.message || String(error) };
              }
            }, selector),
            options.timeoutMs
          );
        } catch (error) {
          selectorMatch = { found: false, error: error?.message || String(error) };
        }

        selectorCache.set(selector, selectorMatch);
      }

      if (selectorMatch?.found && selectorMatch.snippet) {
        const sourceFallback = sourceHtml ? findInSource(sourceHtml, selectorMatch.snippet) : null;
        const context = sourceFallback
          ? extractLineContext(sourceHtml, sourceFallback.index, sourceFallback.length, options.contextLines)
          : null;

        return {
          snippet: selectorMatch.snippet,
          contextBefore: context?.contextBefore || '',
          contextAfter: context?.contextAfter || '',
          source: 'dom-runtime',
          confidence: 'high',
          locator: {
            selector: selector || null,
            xpath: selectorMatch.xpath || null,
            line: context?.line ?? null,
            column: context?.column ?? null,
          },
        };
      }

      if (selectorMatch?.error) {
        errors.push(`Selector lookup failed: ${selectorMatch.error}`);
      }
    }

    if (sourceHtml) {
      const sourceCandidate = issue.html || issue.message || '';
      const sourceMatch = findInSource(sourceHtml, sourceCandidate);
      if (sourceMatch) {
        const context = extractLineContext(
          sourceHtml,
          sourceMatch.index,
          sourceMatch.length,
          options.contextLines
        );

        return {
          snippet: context.snippet,
          contextBefore: context.contextBefore,
          contextAfter: context.contextAfter,
          source: 'response-source',
          confidence: 'medium',
          locator: {
            selector: selector || null,
            xpath: null,
            line: context.line,
            column: context.column,
          },
        };
      }
    }

    const fallback = buildFallbackEvidence(issue);
    if (errors.length > 0) {
      fallback.captureError = errors.join('; ');
    }

    return fallback;
  }
}

export default CodeEvidenceExtractor;
