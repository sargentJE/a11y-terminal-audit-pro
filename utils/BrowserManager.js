/**
 * utils/BrowserManager.js
 * -----------------------------------------------------------------------------
 * Browser Lifecycle Manager ("anti-zombie" Chrome).
 *
 * Why this exists:
 * - Lighthouse runs against a Chrome instance exposed via the DevTools protocol.
 * - Axe (via Puppeteer) benefits from reusing the same browser to save memory.
 * - If a scan crashes mid-run, Chrome can be left running ("zombie Chrome").
 *
 * Design goals:
 * 1) Single, shared Chrome instance per CLI run
 * 2) Safe cleanup on normal exit AND on SIGINT/SIGTERM
 * 3) Clear separation: callers don't worry about ports / killing processes
 */

import * as chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer';
import { defaultLogger as log } from './Logger.js';

/** @typedef {{ chrome: import('chrome-launcher').LaunchedChrome, browser: import('puppeteer').Browser, port: number }} BrowserInstance */

export class BrowserManager {
  /** @type {BrowserInstance|null} */
  static #instance = null;

  /** @type {number} */
  static #refCount = 0;

  /** @type {boolean} */
  static #exitHooksInstalled = false;

  /**
   * Create (or reuse) the shared Chrome + Puppeteer connection.
   *
   * IMPORTANT:
   * - We keep this as a shared singleton so we don't launch multiple Chromes.
   * - Lighthouse can be run multiple times against the same debugging port.
   *
   * @param {object} [opts]
   * @param {string[]} [opts.chromeFlags]
   * @param {string} [opts.chromePath] - Optional explicit Chrome binary path.
   * @param {boolean} [opts.noSandbox=false] - Disable Chrome sandbox (CI-only).
   * @returns {Promise<BrowserInstance>}
   */
  static async create(opts = {}) {
    if (BrowserManager.#instance) {
      BrowserManager.#refCount += 1;
      return BrowserManager.#instance;
    }

    BrowserManager.#installExitHooksOnce();

    const baseChromeFlags = opts.chromeFlags ?? [
      '--headless',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      // Helps reduce some flicker/edge cases in tool automation:
      '--disable-features=RenderDocument',
      // In some sandboxed environments, binding to 0.0.0.0 can be disallowed.
      // Force the debugging endpoint to be local-only.
      '--remote-debugging-address=127.0.0.1',
    ];
    const chromeFlags = [...baseChromeFlags];
    const noSandbox = opts.noSandbox === true;

    if (noSandbox) {
      if (!chromeFlags.includes('--no-sandbox')) chromeFlags.push('--no-sandbox');
      if (!chromeFlags.includes('--disable-setuid-sandbox')) chromeFlags.push('--disable-setuid-sandbox');
      log.warn('Chrome sandbox disabled by configuration. Use only in constrained CI environments.');
    }

    log.debug(`Launching Chrome (flags: ${chromeFlags.join(' ')})`);

    // chrome-launcher defaults to selecting a random unused port by briefly
    // binding an HTTP server to 0.0.0.0. Some sandboxed environments disallow
    // that bind, so we try a small set of fixed ports first.
    const candidatePorts = [9222, 9223, 9224, 9225, 9226];
    let chrome;
    /** @type {any} */
    let lastErr;
    for (const port of candidatePorts) {
      try {
        chrome = await chromeLauncher.launch({
          port,
          chromeFlags,
          // Allow overriding the Chrome binary if needed (CI, custom installs, etc.).
          chromePath: opts.chromePath ?? process.env.CHROME_PATH,
          // Log level can be controlled via LOG_LEVEL env var.
          logLevel: process.env.LOG_LEVEL || 'info',
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err);
        // If the port is in use, try the next one. Otherwise, fail fast.
        if (msg.includes('EADDRINUSE')) continue;
        throw err;
      }
    }
    if (!chrome) {
      throw new Error(
        `Failed to launch Chrome on any candidate debugging port (${candidatePorts.join(
          ', '
        )}): ${lastErr?.message || lastErr}`
      );
    }

    // Chrome-launcher starts Chrome, but Puppeteer may need a moment before it can connect.
    const browser = await BrowserManager.#connectWithRetry(chrome.port);

    BrowserManager.#instance = { chrome, browser, port: chrome.port };
    BrowserManager.#refCount = 1;

    log.debug(`Chrome launched on port ${chrome.port}`);
    return BrowserManager.#instance;
  }

  /**
   * Destroy (or decrement) the shared browser instance.
   *
   * In normal operation, the CLI will call this exactly once at the end of the run.
   * The refCount exists to keep the implementation robust if you later expand the
   * tool to run in parallel tasks.
   *
   * @returns {Promise<void>}
   */
  static async destroy() {
    if (!BrowserManager.#instance) return;

    BrowserManager.#refCount = Math.max(0, BrowserManager.#refCount - 1);

    // If something still holds a reference, do not kill the shared Chrome.
    if (BrowserManager.#refCount > 0) return;

    const { chrome, browser } = BrowserManager.#instance;
    BrowserManager.#instance = null;

    try {
      // Puppeteer connect() uses a WebSocket; disconnect is enough.
      if (browser) await browser.disconnect();
    } catch (err) {
      log.warn(`Puppeteer disconnect failed: ${err?.message || err}`);
    }

    try {
      if (chrome) await chrome.kill();
    } catch (err) {
      log.warn(`Chrome kill failed: ${err?.message || err}`);
    }
  }

  /**
   * @private
   * @param {number} port
   * @returns {Promise<import('puppeteer').Browser>}
   */
  static async #connectWithRetry(port) {
    const browserURL = `http://127.0.0.1:${port}`;

    // Small exponential backoff. This avoids flaky "ECONNREFUSED" races.
    const attempts = 5;
    let lastErr;

    for (let i = 0; i < attempts; i++) {
      try {
        const browser = await puppeteer.connect({
          browserURL,
          // Reassuring default for dev/self-signed cert environments.
          ignoreHTTPSErrors: true,
        });
        return browser;
      } catch (err) {
        lastErr = err;
        const delayMs = 150 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new Error(
      `Failed to connect Puppeteer to Chrome on ${browserURL}: ${lastErr?.message || lastErr}`
    );
  }

  /**
   * @private
   */
  static #installExitHooksOnce() {
    if (BrowserManager.#exitHooksInstalled) return;
    BrowserManager.#exitHooksInstalled = true;

    const cleanup = async (signal) => {
      try {
        log.debug(`Received ${signal}. Cleaning up Chrome...`);
        await BrowserManager.destroy();
      } finally {
        // Re-emit default behaviour: ensure process ends.
        process.exit(signal === 'SIGINT' ? 130 : 0);
      }
    };

    // Typical CLI shutdown signals.
    process.once('SIGINT', () => cleanup('SIGINT'));
    process.once('SIGTERM', () => cleanup('SIGTERM'));

    // Safety net: if Node is exiting due to an uncaught exception,
    // we still want to kill Chrome.
    process.once('uncaughtException', async (err) => {
      log.error(err?.stack || String(err));
      await BrowserManager.destroy();
      process.exit(1);
    });

    process.once('unhandledRejection', async (reason) => {
      log.error(`Unhandled rejection: ${reason?.stack || String(reason)}`);
      await BrowserManager.destroy();
      process.exit(1);
    });
  }
}

export default BrowserManager;
