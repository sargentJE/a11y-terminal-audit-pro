/**
 * utils/Logger.js
 * -----------------------------------------------------------------------------
 * A tiny, dependency-free logger with levels.
 *
 * Why not a full logging library?
 * - This project is a CLI tool; users expect readable terminal output.
 * - Listr2 already owns the "progress UI". We mainly need:
 *   - consistent timestamps
 *   - log levels (debug/info/warn/error)
 *   - optional verbose mode
 *
 * If you later want JSON logs, ship them to a file, or integrate pino/winston,
 * you only need to swap this module.
 */

const LEVELS = /** @type {const} */ ({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
});

export class Logger {
  /**
   * @param {object} opts
   * @param {'debug'|'info'|'warn'|'error'|'silent'} [opts.level='info']
   * @param {(line: string) => void} [opts.sink=console.log] - Where logs go.
   */
  constructor({ level = 'info', sink = console.log } = {}) {
    this.level = level;
    this.sink = sink;
  }

  /** @private */
  _shouldLog(level) {
    return LEVELS[level] >= LEVELS[this.level];
  }

  /** @private */
  _fmt(level, msg) {
    const ts = new Date().toISOString();
    return `[${ts}] ${level.toUpperCase()}: ${msg}`;
  }

  debug(msg) {
    if (this._shouldLog('debug')) this.sink(this._fmt('debug', msg));
  }

  info(msg) {
    if (this._shouldLog('info')) this.sink(this._fmt('info', msg));
  }

  warn(msg) {
    if (this._shouldLog('warn')) this.sink(this._fmt('warn', msg));
  }

  error(msg) {
    if (this._shouldLog('error')) this.sink(this._fmt('error', msg));
  }
}

export const defaultLogger = new Logger({ level: process.env.LOG_LEVEL || 'info' });
export const LEVELS_MAP = LEVELS;
