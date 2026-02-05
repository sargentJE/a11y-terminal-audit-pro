import { Config } from '../utils/Config.js';

/**
 * Parse authentication options from CLI args.
 *
 * @param {Record<string, any>} args
 * @returns {object|null}
 */
export function parseAuthConfig(args) {
  if (args.cookies) {
    try {
      const cookies = JSON.parse(args.cookies);
      return { type: 'cookies', cookies };
    } catch {
      throw new Error('Invalid JSON for --cookies');
    }
  }

  if (args.headers) {
    try {
      const headers = JSON.parse(args.headers);
      return { type: 'headers', headers };
    } catch {
      throw new Error('Invalid JSON for --headers');
    }
  }

  if (args.loginScript) {
    return { type: 'login-script', loginScript: args.loginScript };
  }

  return null;
}

/**
 * Load config file and apply CLI argument overrides.
 *
 * @param {string} cwd
 * @param {Record<string, any>} args
 * @param {string|undefined} urlArg
 */
export async function loadMergedConfig(cwd, args, urlArg) {
  return Config.load(cwd, {
    url: urlArg,
    limit: args.limit ? Number(args.limit) : undefined,
    timeout: args.timeout ? Number(args.timeout) : undefined,
    standard: args.standard,
    details: args.details,
    outDir: args.outDir,
    formats: args.format ? args.format.split(',').map((f) => f.trim()) : undefined,
    concurrency: args.concurrency ? Number(args.concurrency) : undefined,
    browser: {
      noSandbox: args.noSandbox || undefined,
    },
    crawler: {
      useSitemap: args.sitemap || undefined,
      detectSpaRoutes: args.spa || undefined,
    },
    auth: parseAuthConfig(args),
    evidence: {
      enabled: args.noCodeEvidence ? false : args.codeEvidence ? true : undefined,
      contextLines: args.evidenceContextLines ? Number(args.evidenceContextLines) : undefined,
      maxChars: args.evidenceMaxChars ? Number(args.evidenceMaxChars) : undefined,
      maxOpsPerPage: args.evidenceMaxOps ? Number(args.evidenceMaxOps) : undefined,
      timeoutMs: args.evidenceTimeout ? Number(args.evidenceTimeout) : undefined,
    },
    report: {
      csvLegacy: args.csvLegacy || undefined,
    },
    thresholds: {
      maxViolations: args.maxViolations ? Number(args.maxViolations) : undefined,
      maxCritical: args.maxCritical ? Number(args.maxCritical) : undefined,
      maxSerious: args.maxSerious ? Number(args.maxSerious) : undefined,
      minScore: args.minScore ? Number(args.minScore) : undefined,
      minCompliance: args.minCompliance || undefined,
    },
  });
}

export default loadMergedConfig;
