import { Listr } from 'listr2';
import { bold, cyan, red, yellow } from 'colorette';

import CrawlerService from '../services/CrawlerService.js';
import AuditService from '../services/AuditService.js';
import BrowserManager from '../utils/BrowserManager.js';
import { buildReportPaths } from '../utils/Output.js';
import { WCAGCompliance } from '../utils/WCAGCompliance.js';
import { ReportGenerator } from '../utils/ReportGenerator.js';
import { getInputs } from './inputFlow.js';
import { loadMergedConfig } from './configMerge.js';
import { printHelp } from './helpText.js';
import { renderFinalSummary } from './summaryRenderer.js';
import { collectUnifiedIssues, orderReportResults } from './orderResults.js';

/**
 * Execute the full crawl/audit/report pipeline.
 *
 * @param {object} params
 * @param {Record<string, any>} params.args
 * @param {import('../utils/Logger.js').Logger} params.logger
 * @returns {Promise<number>}
 */
export async function runPipeline({ args, logger }) {
  const urlArg = args.url || args._[0];

  console.log(bold(cyan('\n⚡ A11Y TERMINAL AUDIT PRO ⚡\n')));

  const cwd = process.cwd();
  const config = await loadMergedConfig(cwd, args, urlArg);
  const interactive = !args.noInteractive && !config.url;

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
    return 1;
  }

  const outDir = config.outDir || './reports';
  const formats = config.formats || ['json'];
  const { jsonPath } = buildReportPaths({ baseUrl: inputs.url.href, outDir });
  const baseFilename = jsonPath.replace(/\.json$/, '').split('/').pop();

  /** @type {any[]} */
  const report = [];

  /** @type {string[]} */
  let routes = [];

  /** @type {import('../utils/SeverityMapper.js').UnifiedIssue[]} */
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
            useSitemap: config.crawler?.useSitemap ?? true,
            respectRobotsTxt: config.crawler?.respectRobotsTxt ?? true,
            detectSpaRoutes: config.crawler?.detectSpaRoutes ?? true,
            pierceShadowDom: config.crawler?.pierceShadowDom ?? true,
            includePatterns: config.crawler?.includePatterns ?? [],
            excludePatterns: config.crawler?.excludePatterns ?? [],
            discoverCommonPaths: config.crawler?.discoverCommonPaths ?? true,
            followNavigation: config.crawler?.followNavigation ?? true,
            maxDepth: config.crawler?.maxDepth ?? 5,
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
          const ordered = orderReportResults(report, routes);
          report.splice(0, report.length, ...ordered);
          allUnifiedIssues = collectUnifiedIssues(report);
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

          const shouldOpenHtml = formats.includes('html');

          ctx.generatedFiles = await ReportGenerator.generate(payload, outDir, formats, baseFilename, {
            openHtml: shouldOpenHtml,
            csvLegacy: config.report?.csvLegacy === true,
          });
          ctx.evidenceSummary = aggregatedEvidenceSummary;
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
    exitCode = renderFinalSummary({
      report,
      compliance: ctx.compliance,
      evidenceSummary: ctx.evidenceSummary,
      thresholdResult: ctx.thresholdResult,
      generatedFiles: ctx.generatedFiles,
      config,
    });
  } catch (err) {
    console.error(red(`\n✖ Audit failed: ${err?.message || err}\n`));
    exitCode = 1;
  } finally {
    await BrowserManager.destroy().catch(() => {});
  }

  return exitCode;
}

export default runPipeline;
