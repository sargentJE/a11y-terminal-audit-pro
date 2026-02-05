#!/usr/bin/env node
/**
 * index.js
 * -----------------------------------------------------------------------------
 * Enhanced TUI (Terminal User Interface) entry point.
 *
 * Features:
 * - Configuration file support (.a11yrc.json, a11y.config.js)
 * - Multi-format reports (JSON, HTML, CSV, SARIF)
 * - WCAG compliance level calculation (A, AA, AAA)
 * - Threshold-based pass/fail with exit codes
 * - Authentication support (cookies, headers, login scripts)
 * - Parallel audit execution
 * - Enhanced crawler with sitemap and SPA support
 *
 * Responsibilities:
 * - Parse CLI args and merge with config file
 * - Orchestrate crawl + audit phases with progress UI (Listr2)
 * - Calculate WCAG compliance and display results
 * - Export reports in multiple formats
 * - Return appropriate exit codes for CI integration
 */

import { Listr } from 'listr2';
import enquirerPkg from 'enquirer';
import cliTablePkg from 'cli-table3';
import { blue, bold, cyan, green, red, yellow, gray } from 'colorette';

import CrawlerService from './services/CrawlerService.js';
import AuditService from './services/AuditService.js';
import BrowserManager from './utils/BrowserManager.js';
import { Logger } from './utils/Logger.js';
import { parseHttpUrl, toBoundedInt } from './utils/Validation.js';
import { buildReportPaths } from './utils/Output.js';
import { Config } from './utils/Config.js';
import { WCAGCompliance } from './utils/WCAGCompliance.js';
import { ReportGenerator } from './utils/ReportGenerator.js';

// CJS ↔ ESM interop: these packages are CommonJS in many setups.
const { Enquirer } = enquirerPkg;
const Table = cliTablePkg.default || cliTablePkg;

/**
 * Enhanced CLI arg parser with support for new options.
 *
 * Supported:
 *  --url <url>              Target URL (or first positional)
 *  --limit <n>              Pages to crawl (default 5)
 *  --timeout <ms>           Per-tool timeout (default 60000)
 *  --standard <name>        WCAG standard (default WCAG2AA)
 *  --details                Include full tool results in output
 *  --outDir <dir>           Report directory (default ./reports)
 *  --format <formats>       Output formats: json,html,csv,sarif (default json)
 *  --csv-legacy             Emit legacy CSV schema (without evidence columns)
 *  --concurrency <n>        Parallel audit workers (default 1)
 *  --sitemap                Use sitemap.xml for URL discovery
 *  --spa                    Enable SPA route detection
 *  --cookies <json>         Authentication cookies (JSON array)
 *  --headers <json>         Authentication headers (JSON object)
 *  --login-script <path>    Path to login script module
 *  --max-violations <n>     Fail if total violations exceed threshold
 *  --max-critical <n>       Fail if critical issues exceed threshold
 *  --max-serious <n>        Fail if serious issues exceed threshold
 *  --min-score <n>          Fail if Lighthouse score below threshold
 *  --min-compliance <level> Fail if compliance below A/AA/AAA
 *  --code-evidence          Enable exact code evidence extraction (default on)
 *  --no-code-evidence       Disable code evidence extraction
 *  --evidence-context-lines <n> Source context lines for code evidence (default 2)
 *  --evidence-max-chars <n> Max chars per evidence snippet/context (default 2000)
 *  --evidence-max-ops <n>   Max selector lookups per page (default 500)
 *  --evidence-timeout <ms>  Timeout per evidence lookup (default 1500)
 *  --no-sandbox             Disable Chrome sandbox (for constrained CI only)
 *  --init                   Generate sample config file
 *  --verbose                Enable debug logging
 *  --no-interactive         Error instead of prompting
 *  --help
 */
function parseArgs(argv) {
  const args = { _: [] };

  const booleanFlags = [
    'details',
    'verbose',
    'help',
    'no-interactive',
    'no-sandbox',
    'sitemap',
    'spa',
    'init',
    'code-evidence',
    'no-code-evidence',
    'csv-legacy',
  ];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a.startsWith('--')) {
      const key = a.slice(2);
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      if (booleanFlags.includes(key)) {
        args[camelKey] = true;
      } else {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          throw new Error(`Missing value for --${key}`);
        }
        args[camelKey] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
${bold('A11Y TERMINAL AUDIT PRO')} ${gray('v2.0.0')}
Deep-crawl a site and run Lighthouse + axe-core + Pa11y accessibility audits.

${bold('Usage')}
  a11y-audit-pro --url https://example.com --limit 10
  node index.js --url https://example.com --limit 10

${bold('Basic Options')}
  --url <url>             Target URL (required unless interactive)
  --limit <n>             Max pages to crawl (default: 5)
  --timeout <ms>          Per-tool timeout (default: 60000)
  --standard <name>       WCAG standard (default: WCAG2AA)
  --details               Include full tool outputs in report
  --outDir <dir>          Output directory (default: ./reports)
  --no-sandbox            Disable Chrome sandbox (CI-only)
  --verbose               Debug logging
  --no-interactive        Do not prompt; error if required inputs missing
  --help                  Show this help

${bold('Report Options')}
  --format <formats>      Output formats, comma-separated (default: json)
                          Supported: json, html, csv, sarif
  --csv-legacy            Emit legacy CSV schema (without evidence columns)

${bold('Performance Options')}
  --concurrency <n>       Parallel audit workers (default: 1)
                          Higher values = faster but more CPU/memory

${bold('Crawler Options')}
  --sitemap               Use sitemap.xml for URL discovery
  --spa                   Enable SPA route detection (history.pushState)

${bold('Authentication Options')}
  --cookies <json>        Cookies as JSON array:
                          '[{"name":"session","value":"abc","domain":"example.com"}]'
  --headers <json>        Headers as JSON object:
                          '{"Authorization":"Bearer token"}'
  --login-script <path>   Path to login script module

${bold('CI/CD Threshold Options')} (exit code 1 if threshold exceeded)
  --max-violations <n>    Fail if total violations exceed threshold
  --max-critical <n>      Fail if critical issues exceed threshold
  --max-serious <n>       Fail if serious issues exceed threshold
  --min-score <n>         Fail if Lighthouse score below threshold (0-100)
  --min-compliance <lvl>  Fail if compliance level below A/AA/AAA

${bold('Code Evidence Options')}
  --code-evidence         Enable exact code evidence extraction (default: on)
  --no-code-evidence      Disable exact code evidence extraction
  --evidence-context-lines <n>  Source context lines (default: 2)
  --evidence-max-chars <n>      Max chars per snippet/context (default: 2000)
  --evidence-max-ops <n>        Max selector lookups per page (default: 500)
  --evidence-timeout <ms>       Timeout per evidence lookup (default: 1500)

${bold('Config File')}
  --init                  Generate sample .a11yrc.json config file

  Config files are automatically loaded from the current directory:
  - .a11yrc.json (JSON format)
  - a11y.config.js (JavaScript format)

${bold('Examples')}
  ${gray('# Basic audit')}
  a11y-audit-pro --url https://example.com --limit 5

  ${gray('# Generate HTML and SARIF reports')}
  a11y-audit-pro --url https://example.com --format json,html,sarif

  ${gray('# CI mode with thresholds')}
  a11y-audit-pro --url https://example.com --max-critical 0 --min-score 80

  ${gray('# With authentication')}
  a11y-audit-pro --url https://myapp.com --cookies '[{"name":"token","value":"xyz"}]'

  ${gray('# Use sitemap and parallel execution')}
  a11y-audit-pro --url https://example.com --sitemap --concurrency 3
`);
}

/**
 * @param {object} params
 * @param {boolean} params.interactive
 * @param {string|undefined} params.urlArg
 * @param {string|undefined} params.limitArg
 * @param {string|undefined} params.timeoutArg
 * @param {string|undefined} params.standardArg
 * @returns {Promise<{ url: URL, limit: number, timeoutMs: number, standard: string }>}
 */
async function getInputs({ interactive, urlArg, limitArg, timeoutArg, standardArg }) {
  // Non-interactive: validate what we have.
  if (!interactive) {
    const url = parseHttpUrl(urlArg || '');
    const limit = toBoundedInt(Number(limitArg ?? 5), { min: 1, max: 500, name: 'limit' });
    const timeoutMs = toBoundedInt(Number(timeoutArg ?? 60_000), {
      min: 5_000,
      max: 300_000,
      name: 'timeout',
    });

    return { url, limit, timeoutMs, standard: String(standardArg || 'WCAG2AA') };
  }

  // Interactive: prompt for values (with strict validation).
  const enquirer = new Enquirer();

  const prompts = [
    {
      type: 'input',
      name: 'url',
      message: 'Target URL:',
      initial: urlArg || 'https://example.com',
      validate: (value) => {
        try {
          parseHttpUrl(value);
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'input',
      name: 'limit',
      message: 'Page Limit:',
      initial: String(limitArg ?? 5),
      validate: (value) => {
        try {
          toBoundedInt(Number(value), { min: 1, max: 500, name: 'limit' });
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'input',
      name: 'timeoutMs',
      message: 'Timeout per tool (ms):',
      initial: String(timeoutArg ?? 60_000),
      validate: (value) => {
        try {
          toBoundedInt(Number(value), { min: 5_000, max: 300_000, name: 'timeout' });
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'select',
      name: 'standard',
      message: 'WCAG standard:',
      initial: standardArg || 'WCAG2AA',
      choices: [
        'WCAG2A',
        'WCAG2AA',
        'WCAG2AAA',
        'WCAG21A',
        'WCAG21AA',
        'WCAG21AAA',
        'WCAG22A',
        'WCAG22AA',
        'WCAG22AAA',
      ],
    },
  ];

  const answers = await enquirer.prompt(prompts);

  return {
    url: parseHttpUrl(answers.url),
    limit: toBoundedInt(Number(answers.limit), { min: 1, max: 500, name: 'limit' }),
    timeoutMs: toBoundedInt(Number(answers.timeoutMs), {
      min: 5_000,
      max: 300_000,
      name: 'timeout',
    }),
    standard: String(answers.standard || 'WCAG2AA'),
  };
}

/**
 * Parse authentication options from CLI args.
 *
 * @param {object} args - CLI args
 * @returns {object|null} - Auth config or null
 */
function parseAuthConfig(args) {
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
 * Format compliance badge for terminal.
 *
 * @param {string} level - Compliance level
 * @returns {string}
 */
function formatComplianceBadge(level) {
  const badges = {
    'AAA': green(bold('✓ AAA')),
    'AA': blue(bold('✓ AA')),
    'A': yellow(bold('✓ A')),
    'Non-Conformant': red(bold('✗ Non-Conformant')),
  };
  return badges[level] || level;
}

(async () => {
  const argv = process.argv.slice(2);

  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(red(`\nError: ${err.message}\n`));
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Generate sample config file
  if (args.init) {
    await Config.generateSampleConfig('./.a11yrc.json');
    console.log(green('✔ Generated sample config file: .a11yrc.json'));
    process.exit(0);
  }

  // If the user gives a positional URL, treat it as --url.
  const urlArg = args.url || args._[0];

  // Verbose mode is opt-in. We keep default output clean and minimal.
  const logger = new Logger({ level: args.verbose ? 'debug' : 'info' });

  console.log(bold(cyan('\n⚡ A11Y TERMINAL AUDIT PRO ⚡\n')));

  // Load config file and merge with CLI args
  const cwd = process.cwd();
  const config = await Config.load(cwd, {
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

  // Respect URL from merged config to avoid prompting unnecessarily.
  const interactive = !args.noInteractive && !config.url;

  // Gather validated inputs (and prompt if needed).
  let inputs;
  try {
    inputs = await getInputs({
      interactive,
      urlArg: config.url,
      limitArg: String(config.limit),
      timeoutArg: String(config.timeout),
      standardArg: config.standard,
    });
  } catch (err) {
    console.error(red(`\nError: ${err.message}\n`));
    printHelp();
    process.exit(1);
  }

  // Build output paths
  const outDir = config.outDir || './reports';
  const formats = config.formats || ['json'];
  const { jsonPath } = buildReportPaths({ baseUrl: inputs.url.href, outDir });
  const baseFilename = jsonPath.replace(/\.json$/, '').split('/').pop();

  // This is the report array we will export. Each item is the unified result of one page.
  /** @type {any[]} */
  const report = [];

  /** @type {string[]} */
  let routes = [];

  /** @type {import('./utils/SeverityMapper.js').UnifiedIssue[]} */
  let allUnifiedIssues = [];

  const tasks = new Listr(
    [
      {
        title: 'Phase 0: Launching Chrome',
        task: async (ctx) => {
          ctx.instance = await BrowserManager.create({
            noSandbox: config.browser?.noSandbox === true,
          });
        },
      },
      {
        title: 'Phase 1: Deep Crawl',
        task: async (ctx, task) => {
          const crawlerConfig = {
            useSitemap: config.crawler?.useSitemap ?? true,  // Enabled by default
            respectRobotsTxt: config.crawler?.respectRobotsTxt ?? true,
            detectSpaRoutes: config.crawler?.detectSpaRoutes ?? true,  // Enabled by default
            pierceShadowDom: config.crawler?.pierceShadowDom ?? true,
            includePatterns: config.crawler?.includePatterns ?? [],
            excludePatterns: config.crawler?.excludePatterns ?? [],
            discoverCommonPaths: config.crawler?.discoverCommonPaths ?? true,  // New option
            followNavigation: config.crawler?.followNavigation ?? true,  // New option
            maxDepth: config.crawler?.maxDepth ?? 5,  // New option
          };

          const crawler = new CrawlerService(inputs.url.href, {
            limit: inputs.limit,
            config: crawlerConfig,
          });

          routes = await crawler.discoverRoutes({
            browser: ctx.instance.browser,
            onMsg: (m) => {
              task.output = m;
            },
          });

          // In case the crawl discovers nothing, ensure at least the start URL is audited.
          if (routes.length === 0) routes = [inputs.url.href];

          task.output = `Discovered ${routes.length} route(s)`;
        },
        options: {
          persistentOutput: true,
        },
      },
      {
        title: 'Phase 2: Scanning Routes',
        task: (ctx, task) =>
          task.newListr(
            routes.map((route) => ({
              title: `Pending: ${route}`,
              task: async (_subCtx, subTask) => {
                const data = await AuditService.run(route, ctx.instance, {
                  timeoutMs: inputs.timeoutMs,
                  includeDetails: Boolean(config.details),
                  standard: inputs.standard,
                  deduplicateIssues: config.deduplicateIssues ?? true,
                  evidence: config.evidence,
                  auth: config.auth,
                });

                report.push(data);

                // Collect unified issues
                if (data.unifiedIssues) {
                  allUnifiedIssues.push(...data.unifiedIssues);
                }

                const lh = data.lhScore != null ? `${data.lhScore}%` : '—';
                const axe = data.axeViolations != null ? data.axeViolations : '—';
                const p11y = data.pa11yIssues != null ? data.pa11yIssues : '—';
                const issues = data.totalIssues ?? 0;

                subTask.title = `Done: ${route} (LH: ${lh}, Axe: ${axe}, Pa11y: ${p11y}, Issues: ${issues})`;

                const hadErrors = data.errors && Object.keys(data.errors).length > 0;
                if (hadErrors) {
                  subTask.title = `${yellow('⚠')} ${subTask.title}`;
                }
              },
            })),
            {
              concurrent: config.concurrency || 1,
              exitOnError: false,
              rendererOptions: { collapseErrors: false },
            }
          ),
      },
      {
        title: 'Phase 3: Calculating Compliance',
        task: async (ctx) => {
          ctx.compliance = WCAGCompliance.calculate(allUnifiedIssues, inputs.standard);
        },
      },
      {
        title: 'Phase 4: Exporting Reports',
        task: async (ctx) => {
          const avgLhScore = report.reduce((sum, r) => sum + (r.lhScore || 0), 0) / report.length;
          const aggregatedEvidenceSummary = report.reduce(
            (acc, row) => {
              const summary = row.evidenceSummary;
              if (!summary) return acc;

              acc.totalIssues += summary.totalIssues || 0;
              acc.high += summary.high || 0;
              acc.medium += summary.medium || 0;
              acc.low += summary.low || 0;
              acc.unresolved += summary.unresolved || 0;
              acc.extractionMs += summary.extractionMs || 0;
              return acc;
            },
            {
              enabled: config.evidence?.enabled ?? true,
              totalIssues: 0,
              high: 0,
              medium: 0,
              low: 0,
              unresolved: 0,
              extractionMs: 0,
            }
          );

          const payload = {
            meta: {
              tool: 'a11y-terminal-audit-pro',
              version: '2.0.0',
              generatedAt: new Date().toISOString(),
              baseUrl: inputs.url.href,
              limit: inputs.limit,
              timeoutMs: inputs.timeoutMs,
              standard: inputs.standard,
              includeDetails: Boolean(config.details),
              routesAudited: routes.length,
              concurrency: config.concurrency || 1,
              evidence: config.evidence,
              evidenceSummary: aggregatedEvidenceSummary,
              report: {
                csvLegacy: config.report?.csvLegacy === true,
              },
              formats,
            },
            compliance: ctx.compliance,
            results: report,
          };

          // Auto-open HTML if format includes html
          const shouldOpenHtml = formats.includes('html');

          ctx.generatedFiles = await ReportGenerator.generate(
            payload,
            outDir,
            formats,
            baseFilename,
            {
              openHtml: shouldOpenHtml,
              csvLegacy: config.report?.csvLegacy === true,
            }
          );
          ctx.evidenceSummary = aggregatedEvidenceSummary;

          // Check thresholds
          ctx.thresholdResult = WCAGCompliance.checkThresholds(
            allUnifiedIssues,
            avgLhScore,
            config.thresholds || {}
          );
        },
      },
    ],
    {
      rendererOptions: {
        showTimer: true,
        collapse: false,
      },
    }
  );

  let exitCode = 0;

  try {
    const ctx = await tasks.run({ logger });

    // Final Terminal Report - Summary Table
    const table = new Table({
      head: [blue('URL'), blue('LH Score'), blue('Axe'), blue('Pa11y'), blue('Issues'), blue('Time')],
      colWidths: [50, 10, 6, 8, 8, 8],
      wordWrap: true,
    });

    for (const r of report) {
      table.push([
        r.url,
        r.lhScore != null ? `${r.lhScore}%` : '—',
        r.axeViolations != null ? String(r.axeViolations) : '—',
        r.pa11yIssues != null ? String(r.pa11yIssues) : '—',
        String(r.totalIssues ?? 0),
        typeof r.durationMs === 'number' ? `${Math.round(r.durationMs / 1000)}s` : '—',
      ]);
    }

    console.log('\n' + table.toString());

    // Compliance Summary
    const compliance = ctx.compliance;
    console.log('\n' + bold('WCAG Compliance Summary'));
    console.log('─'.repeat(50));
    console.log(`  Compliance Level: ${formatComplianceBadge(compliance.level)}`);
    console.log(`  Compliance Score: ${bold(String(compliance.score))}/100`);
    console.log(`  ${compliance.description}`);
    console.log('');
    console.log(`  Issues by Severity:`);
    console.log(`    ${red('Critical')}: ${compliance.summary.critical}`);
    console.log(`    ${yellow('Serious')}:  ${compliance.summary.serious}`);
    console.log(`    ${blue('Moderate')}: ${compliance.summary.moderate}`);
    console.log(`    ${gray('Minor')}:    ${compliance.summary.minor}`);
    console.log(`    ${bold('Total')}:    ${compliance.summary.total}`);

    if (compliance.wcagSummary.failedA.length > 0) {
      console.log(`\n  ${red('Failed Level A Criteria:')}`);
      for (const c of compliance.wcagSummary.failedA.slice(0, 5)) {
        console.log(`    - ${c}`);
      }
      if (compliance.wcagSummary.failedA.length > 5) {
        console.log(`    ... and ${compliance.wcagSummary.failedA.length - 5} more`);
      }
    }

    if (compliance.wcagSummary.failedAA.length > 0) {
      console.log(`\n  ${yellow('Failed Level AA Criteria:')}`);
      for (const c of compliance.wcagSummary.failedAA.slice(0, 5)) {
        console.log(`    - ${c}`);
      }
      if (compliance.wcagSummary.failedAA.length > 5) {
        console.log(`    ... and ${compliance.wcagSummary.failedAA.length - 5} more`);
      }
    }

    if (ctx.evidenceSummary) {
      const evidenceSummary = ctx.evidenceSummary;
      if (evidenceSummary.enabled) {
        console.log('\n' + bold('Code Evidence Summary'));
        console.log('─'.repeat(50));
        console.log(`  Coverage: ${evidenceSummary.totalIssues > 0 ? Math.round(((evidenceSummary.high + evidenceSummary.medium + evidenceSummary.low) / evidenceSummary.totalIssues) * 100) : 0}%`);
        console.log(`  High confidence:   ${evidenceSummary.high}`);
        console.log(`  Medium confidence: ${evidenceSummary.medium}`);
        console.log(`  Low confidence:    ${evidenceSummary.low}`);
        console.log(`  Unresolved:        ${evidenceSummary.unresolved}`);
        console.log(`  Extraction time:   ${Math.round((evidenceSummary.extractionMs || 0) / 1000)}s`);
      } else {
        console.log('\n' + gray('Code Evidence Summary: disabled'));
      }
    }

    // Threshold check results
    const thresholdResult = ctx.thresholdResult;
    if (thresholdResult && !thresholdResult.passed) {
      console.log('\n' + red(bold('Threshold Check: FAILED')));
      for (const failure of thresholdResult.failures) {
        console.log(`  ${red('✗')} ${failure}`);
      }
      exitCode = 1;
    } else if (thresholdResult && config.__meta?.hasUserThresholds) {
      console.log('\n' + green(bold('Threshold Check: PASSED')));
    }

    // Report file locations
    console.log('\n' + bold('Generated Reports:'));
    for (const file of ctx.generatedFiles || []) {
      console.log(green(`  ✔ ${file}`));
    }

  } catch (err) {
    console.error(red(`\n✖ Audit failed: ${err?.message || err}\n`));
    exitCode = 1;
  } finally {
    await BrowserManager.destroy().catch(() => {});
  }

  process.exit(exitCode);
})();
