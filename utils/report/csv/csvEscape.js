/**
 * Prevent formula execution in spreadsheet tools.
 *
 * @param {string} str
 * @returns {string}
 */
export function sanitizeForSpreadsheet(str) {
  if (/^[\t\r ]*[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escape a CSV cell.
 *
 * @param {unknown} val
 * @returns {string}
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = sanitizeForSpreadsheet(String(val));
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default escapeCsvCell;
