/**
 * utils/ReportGenerator.js
 * -----------------------------------------------------------------------------
 * Facade for multi-format report generation.
 */

import fs from 'fs-extra';
import path from 'path';
import { defaultLogger as log } from './Logger.js';
import { openInBrowser } from './report/open/openInBrowser.js';
import { generateJsonReport } from './report/json/generateJsonReport.js';
import { generateHtmlReport } from './report/html/generateHtmlReport.js';
import { generateCsvReport } from './report/csv/generateCsvReport.js';
import { generateSarifReport } from './report/sarif/generateSarifReport.js';

export class ReportGenerator {
  /**
   * Generate reports in the specified formats.
   *
   * @param {any} data
   * @param {string} outDir
   * @param {string[]} formats
   * @param {string} baseFilename
   * @param {Object} [options]
   * @param {boolean} [options.openHtml=false]
   * @param {boolean} [options.csvLegacy=false]
   * @returns {Promise<string[]>}
   */
  static async generate(data, outDir, formats, baseFilename, options = {}) {
    await fs.ensureDir(outDir);
    const generatedFiles = [];
    let htmlPath = null;

    for (const format of formats) {
      const filepath = path.join(outDir, `${baseFilename}.${format}`);

      switch (format.toLowerCase()) {
        case 'json':
          await generateJsonReport(data, filepath);
          break;
        case 'html':
          await generateHtmlReport(data, filepath);
          htmlPath = filepath;
          break;
        case 'csv':
          await generateCsvReport(data, filepath, {
            csvLegacy: options.csvLegacy === true,
          });
          break;
        case 'sarif':
          await generateSarifReport(data, filepath);
          break;
        default:
          log.warn(`Unknown report format: ${format}`);
          continue;
      }

      generatedFiles.push(filepath);
      log.debug(`Generated ${format.toUpperCase()} report: ${filepath}`);
    }

    const skipOpen = process.env.A11Y_SKIP_OPEN_HTML === '1' || process.env.A11Y_OPEN_HTML === 'false';
    if (!skipOpen && options.openHtml && htmlPath) {
      openInBrowser(htmlPath);
    }

    return generatedFiles;
  }
}

export default ReportGenerator;
