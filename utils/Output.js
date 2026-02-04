/**
 * utils/Output.js
 * -----------------------------------------------------------------------------
 * Report exporting utilities.
 *
 * We export JSON by default because it is:
 * - machine-readable
 * - diffable
 * - easy to convert into an HTML dashboard later
 */

import fs from 'fs-extra';
import path from 'node:path';

/**
 * Create a filename-safe slug.
 * @param {string} str
 */
function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} [opts.outDir='./reports']
 * @returns {{ outDir: string, jsonPath: string }}
 */
export function buildReportPaths({ baseUrl, outDir = './reports' }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = slugify(baseUrl) || 'site';
  const dir = outDir;
  const jsonPath = path.join(dir, `audit-${name}-${stamp}.json`);
  return { outDir: dir, jsonPath };
}

/**
 * @param {string} filePath
 * @param {unknown} data
 */
export async function writeJsonReport(filePath, data) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.outputJson(filePath, data, { spaces: 2 });
}
