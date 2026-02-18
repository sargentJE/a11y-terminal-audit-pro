/**
 * Canonical audit tool selection helpers.
 */

export const SUPPORTED_TOOLS = Object.freeze(['lighthouse', 'axe', 'pa11y']);
export const DEFAULT_TOOLS = Object.freeze(['axe']);
export const TOOL_SELECTION_ERROR_CODES = Object.freeze({
  UNKNOWN: 'TOOL_UNKNOWN',
  EMPTY: 'TOOL_EMPTY',
  INCOMPATIBLE_THRESHOLD: 'TOOL_INCOMPATIBLE_THRESHOLD',
});

export class ToolSelectionError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ToolSelectionError';
    this.code = code;
  }
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isToolSelectionError(error) {
  return (
    error instanceof ToolSelectionError ||
    (error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'ToolSelectionError' &&
      'code' in error)
  );
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function toTokens(value) {
  const source = Array.isArray(value) ? value : [value];
  const tokens = [];

  for (const entry of source) {
    if (entry == null) continue;
    const parts = String(entry)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    tokens.push(...parts);
  }

  return tokens;
}

/**
 * Parse and normalize selected tools.
 *
 * @param {unknown} raw
 * @param {object} [opts]
 * @param {boolean} [opts.allowUndefined=false] - Return undefined when raw is undefined/null.
 * @returns {string[]|undefined}
 */
export function parseToolSelection(raw, opts = {}) {
  const allowUndefined = opts.allowUndefined === true;

  if ((raw === undefined || raw === null) && allowUndefined) {
    return undefined;
  }

  const tokens = toTokens(raw);
  if (tokens.length === 0) {
    throw new ToolSelectionError(
      TOOL_SELECTION_ERROR_CODES.EMPTY,
      'No tools selected. Use one or more of: lighthouse, axe, pa11y.'
    );
  }

  const unknown = tokens.filter((token) => {
    const normalized = token.toLowerCase();
    return !SUPPORTED_TOOLS.includes(normalized);
  });

  if (unknown.length > 0) {
    const uniqueUnknown = [...new Set(unknown)];
    throw new ToolSelectionError(
      TOOL_SELECTION_ERROR_CODES.UNKNOWN,
      `Unknown tool(s): ${uniqueUnknown.join(', ')}. Supported tools: ${SUPPORTED_TOOLS.join(', ')}`
    );
  }

  const normalizedSet = new Set(tokens.map((token) => token.toLowerCase()));
  const ordered = SUPPORTED_TOOLS.filter((tool) => normalizedSet.has(tool));

  if (ordered.length === 0) {
    throw new ToolSelectionError(
      TOOL_SELECTION_ERROR_CODES.EMPTY,
      'No tools selected. Use one or more of: lighthouse, axe, pa11y.'
    );
  }

  return ordered;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function hasExplicitToolSelection(raw) {
  return raw !== undefined && raw !== null;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function resolveSelectedTools(raw) {
  const parsed = parseToolSelection(raw, { allowUndefined: true });
  return parsed ?? [...DEFAULT_TOOLS];
}

/**
 * @param {string[]} tools
 * @param {object} [thresholds]
 */
export function validateToolThresholdCompatibility(tools, thresholds = {}) {
  const hasMinScore =
    Number.isFinite(Number(thresholds.minScore)) && Number(thresholds.minScore) > 0;

  if (hasMinScore && !tools.includes('lighthouse')) {
    throw new ToolSelectionError(
      TOOL_SELECTION_ERROR_CODES.INCOMPATIBLE_THRESHOLD,
      '--min-score requires Lighthouse. Include it via --tool lighthouse.'
    );
  }
}

export default {
  SUPPORTED_TOOLS,
  DEFAULT_TOOLS,
  parseToolSelection,
  hasExplicitToolSelection,
  resolveSelectedTools,
  validateToolThresholdCompatibility,
  ToolSelectionError,
  isToolSelectionError,
  TOOL_SELECTION_ERROR_CODES,
};
