/**
 * utils/Config.js
 * -----------------------------------------------------------------------------
 * Configuration loader for A11Y Terminal Audit Pro.
 *
 * Supports:
 * - .a11yrc.json (JSON config file)
 * - a11y.config.js (JavaScript config file)
 * - CLI arguments (highest priority)
 *
 * Priority order (highest to lowest):
 * 1. CLI arguments
 * 2. Config file
 * 3. Default values
 */

import fs from 'fs-extra';
import path from 'path';
import { pathToFileURL } from 'url';
import { defaultLogger as log } from './Logger.js';

/** @typedef {import('./Validation.js').ValidatedOptions} ValidatedOptions */

/**
 * @typedef {Object} AuthConfig
 * @property {string} [type] - 'cookies' | 'headers' | 'login-script'
 * @property {Array<{name: string, value: string, domain?: string, path?: string}>} [cookies]
 * @property {Record<string, string>} [headers]
 * @property {string} [loginScript] - Path to login script module
 * @property {Object} [loginCredentials] - Credentials passed to login script
 */

/**
 * @typedef {Object} ThresholdConfig
 * @property {number} [maxViolations] - Fail if total violations exceed this
 * @property {number} [maxCritical] - Fail if critical issues exceed this
 * @property {number} [maxSerious] - Fail if serious issues exceed this
 * @property {number} [minScore] - Fail if Lighthouse score below this (0-100)
 * @property {string} [minCompliance] - Minimum WCAG compliance level: 'A' | 'AA' | 'AAA'
 */

/**
 * @typedef {Object} CrawlerConfig
 * @property {boolean} [useSitemap] - Parse sitemap.xml for URLs
 * @property {boolean} [respectRobotsTxt] - Respect robots.txt disallow rules
 * @property {boolean} [detectSpaRoutes] - Monitor history.pushState for SPA routes
 * @property {boolean} [pierceShadowDom] - Scan Shadow DOM elements
 * @property {string[]} [includePatterns] - URL patterns to include (glob)
 * @property {string[]} [excludePatterns] - URL patterns to exclude (glob)
 */

/**
 * @typedef {Object} BrowserConfig
 * @property {boolean} [noSandbox] - Disable Chrome sandbox (for constrained CI only)
 */

/**
 * @typedef {Object} FullConfig
 * @property {string} url - Base URL to audit
 * @property {number} limit - Max pages to crawl
 * @property {number} timeout - Timeout per page in ms
 * @property {string} standard - WCAG standard
 * @property {boolean} details - Include detailed findings
 * @property {string} outDir - Output directory
 * @property {string[]} formats - Output formats: json, html, csv, sarif
 * @property {number} concurrency - Parallel audit workers
 * @property {AuthConfig} [auth] - Authentication configuration
 * @property {ThresholdConfig} [thresholds] - Pass/fail thresholds
 * @property {CrawlerConfig} [crawler] - Crawler configuration
 * @property {BrowserConfig} [browser] - Browser launch options
 * @property {boolean} [deduplicateIssues] - Remove duplicate issues across tools
 */

/** Config file names to search for (in order) */
const CONFIG_FILES = ['.a11yrc.json', 'a11y.config.js', 'a11y.config.mjs'];

/** Default configuration values */
const DEFAULTS = {
  limit: 5,
  timeout: 60000,
  standard: 'WCAG2AA',
  details: false,
  outDir: './reports',
  formats: ['json'],
  concurrency: 1,
  deduplicateIssues: true,
  browser: {
    noSandbox: false,
  },
  crawler: {
    useSitemap: true,  // Enabled by default for comprehensive page discovery
    respectRobotsTxt: true,
    detectSpaRoutes: true,  // Enabled by default for SPA support
    pierceShadowDom: true,
    discoverCommonPaths: true,  // Probe common URL paths
    followNavigation: true,  // Prioritize nav/footer links
    maxDepth: 5,  // Max crawl depth
    includePatterns: [],
    excludePatterns: [],
  },
  thresholds: {
    maxViolations: Infinity,
    maxCritical: Infinity,
    maxSerious: Infinity,
    minScore: 0,
    minCompliance: null,
  },
};

export class Config {
  /**
   * Load configuration from file and merge with CLI args.
   *
   * @param {string} cwd - Current working directory to search for config
   * @param {Partial<FullConfig>} cliArgs - CLI arguments (highest priority)
   * @returns {Promise<FullConfig>}
   */
  static async load(cwd, cliArgs = {}) {
    const fileConfig = await Config.#loadConfigFile(cwd);
    const hasUserThresholds = Config.#hasUserThresholds(fileConfig, cliArgs);

    // Deep merge: defaults <- fileConfig <- cliArgs
    const merged = Config.#deepMerge(
      Config.#deepMerge(DEFAULTS, fileConfig),
      cliArgs
    );

    // Runtime metadata for the CLI flow (kept out of report payloads).
    Object.defineProperty(merged, '__meta', {
      value: {
        hasUserThresholds,
      },
      enumerable: false,
      writable: false,
      configurable: false,
    });

    log.debug(`Loaded config: ${JSON.stringify(merged, null, 2)}`);
    return merged;
  }

  /**
   * Search for and load a config file.
   *
   * @private
   * @param {string} cwd
   * @returns {Promise<Partial<FullConfig>>}
   */
  static async #loadConfigFile(cwd) {
    for (const filename of CONFIG_FILES) {
      const filepath = path.join(cwd, filename);

      if (await fs.pathExists(filepath)) {
        log.debug(`Found config file: ${filepath}`);

        if (filename.endsWith('.json')) {
          return Config.#loadJsonConfig(filepath);
        } else {
          return Config.#loadJsConfig(filepath);
        }
      }
    }

    log.debug('No config file found, using defaults');
    return {};
  }

  /**
   * Load JSON config file.
   *
   * @private
   * @param {string} filepath
   * @returns {Promise<Partial<FullConfig>>}
   */
  static async #loadJsonConfig(filepath) {
    try {
      const content = await fs.readJson(filepath);
      return Config.#validateConfig(content, filepath);
    } catch (err) {
      log.warn(`Failed to parse ${filepath}: ${err.message}`);
      return {};
    }
  }

  /**
   * Load JavaScript config file.
   *
   * @private
   * @param {string} filepath
   * @returns {Promise<Partial<FullConfig>>}
   */
  static async #loadJsConfig(filepath) {
    try {
      const fileUrl = pathToFileURL(filepath).href;
      const module = await import(fileUrl);
      const content = module.default || module;
      return Config.#validateConfig(content, filepath);
    } catch (err) {
      log.warn(`Failed to load ${filepath}: ${err.message}`);
      return {};
    }
  }

  /**
   * Validate config object structure.
   *
   * @private
   * @param {unknown} config
   * @param {string} filepath
   * @returns {Partial<FullConfig>}
   */
  static #validateConfig(config, filepath) {
    if (typeof config !== 'object' || config === null) {
      log.warn(`Config file ${filepath} must export an object`);
      return {};
    }

    // Type coercion for known fields
    const result = { ...config };

    if (result.limit !== undefined) {
      result.limit = Number(result.limit);
    }
    if (result.timeout !== undefined) {
      result.timeout = Number(result.timeout);
    }
    if (result.concurrency !== undefined) {
      result.concurrency = Number(result.concurrency);
    }
    if (result.formats && typeof result.formats === 'string') {
      result.formats = [result.formats];
    }

    return result;
  }

  /**
   * Deep merge two objects.
   *
   * @private
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  static #deepMerge(target, source) {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = result[key];

      if (sourceVal === undefined) continue;

      if (
        sourceVal !== null &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal !== null &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        result[key] = Config.#deepMerge(targetVal, sourceVal);
      } else {
        result[key] = sourceVal;
      }
    }

    return result;
  }

  /**
   * Determine whether thresholds were explicitly configured by the user.
   *
   * @private
   * @param {Partial<FullConfig>} fileConfig
   * @param {Partial<FullConfig>} cliArgs
   * @returns {boolean}
   */
  static #hasUserThresholds(fileConfig, cliArgs) {
    const keys = ['maxViolations', 'maxCritical', 'maxSerious', 'minScore', 'minCompliance'];
    const hasAny = (obj) =>
      keys.some((key) => obj?.thresholds && obj.thresholds[key] !== undefined);

    return hasAny(fileConfig) || hasAny(cliArgs);
  }

  /**
   * Generate a sample config file.
   *
   * @param {string} outputPath
   * @returns {Promise<void>}
   */
  static async generateSampleConfig(outputPath) {
    const sample = {
      url: 'https://example.com',
      limit: 10,
      timeout: 60000,
      standard: 'WCAG2AA',
      details: true,
      outDir: './reports',
      formats: ['json', 'html'],
      concurrency: 3,
      deduplicateIssues: true,
      browser: {
        noSandbox: false,
      },
      crawler: {
        useSitemap: true,
        respectRobotsTxt: true,
        detectSpaRoutes: true,
        pierceShadowDom: true,
        includePatterns: [],
        excludePatterns: ['/admin/*', '/api/*'],
      },
      thresholds: {
        maxViolations: 50,
        maxCritical: 0,
        maxSerious: 5,
        minScore: 80,
        minCompliance: 'AA',
      },
      auth: {
        type: 'cookies',
        cookies: [
          {
            name: 'session',
            value: 'your-session-token',
            domain: 'example.com',
          },
        ],
      },
    };

    await fs.outputJson(outputPath, sample, { spaces: 2 });
    log.info(`Sample config written to ${outputPath}`);
  }
}

export default Config;
