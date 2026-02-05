import fs from 'fs-extra';

/**
 * @param {any} data
 * @param {string} filepath
 */
export async function generateJsonReport(data, filepath) {
  await fs.outputJson(filepath, data, { spaces: 2 });
}

export default generateJsonReport;
