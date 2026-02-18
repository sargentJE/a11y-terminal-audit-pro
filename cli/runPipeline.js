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
import { validateToolThresholdCompatibility } from '../utils/toolSelection.js';

const SUPPRESS_DEFAULT_TOOL_WARNING_ENV = 'A11Y_SUPPRESS_TOOL_DEFAULT_WARNING';

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
  const shouldPromptForTools = interactive && config.__meta?.hasUserToolsSelection !== true;

  let inputs;
  try {
    inputs = await getInputs({
      interactive,
      urlArg: config.url,
      limitArg: String(config.limit),
      timeoutArg: String(config.timeout),
      standardArg: config.standard,
      promptForTools: shouldPromptForTools,
      toolsArg: config.tools,
    });

    const shouldWarnImplicitDefault =
      config.__meta?.hasUserToolsSelection !== true &&
      !shouldPromptForTools &&
      process.env[SUPPRESS_DEFAULT_TOOL_WARNING_ENV] !== '1';
    if (shouldWarnImplicitDefault) {
      console.log(
        yellow(
          '⚠ Default scan tool is axe. To run legacy all-tool behavior, use --tool lighthouse,axe,pa11y'
        )
      );
    }

    validateToolThresholdCompatibility(inputs.tools, config.thresholds || {});
  } catch (err) {
    console.error(red(`\nError: ${err.message}\n`));
    printHelp();
    return 1;
  }
  const selectedTools = inputs.tools;

  const outDir = config.outDir || './reports';
  const formats = config.formats || ['json'];
  const includeManualChecks = config.compliance?.includeManualChecks === true;
  const verificationV2 = config.verification?.v2 === true;
  const verificationDeterministic = config.verification?.deterministic === true;
  const verificationConfidenceThreshold = config.verification?.confidenceThreshold || 'high';
  const verificationGridSize = Number.isFinite(config.verification?.gridSize)
    ? Number(config.verification.gridSize)
    : 24;
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
                  tools: selectedTools,
                  deduplicateIssues: config.deduplicateIssues ?? true,
                  evidence: config.evidence,
                  auth: config.auth,
                  verification: {
                    v2: verificationV2,
                    deterministic: verificationDeterministic,
                    confidenceThreshold: verificationConfidenceThreshold,
                    gridSize: verificationGridSize,
                  },
                });

                report.push(data);

                const formatMetric = (tool, value, format) => {
                  if (!selectedTools.includes(tool)) return 'SKIP';
                  if (value != null) return format(value);
                  if (data.errors?.[tool]) return 'ERR';
                  return '—';
                };
                const lh = formatMetric('lighthouse', data.lhScore, (v) => `${v}%`);
                const axe = formatMetric('axe', data.axeViolations, (v) => v);
                const p11y = formatMetric('pa11y', data.pa11yIssues, (v) => v);
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
          ctx.compliance = WCAGCompliance.calculate(allUnifiedIssues, inputs.standard, {
            includeManualChecks,
            confidenceThreshold: verificationConfidenceThreshold,
          });
        },
      },
      {
        title: 'Phase 4: Exporting Reports',
        task: async (ctx) => {
          const lhScores = report
            .map((r) => r.lhScore)
            .filter((score) => typeof score === 'number');
          const avgLhScore =
            lhScores.length > 0
              ? lhScores.reduce((sum, score) => sum + score, 0) / lhScores.length
              : 0;
          ctx.thresholdResult = WCAGCompliance.checkThresholds(
            allUnifiedIssues,
            avgLhScore,
            config.thresholds || {},
            {
              includeManualChecks,
              confidenceThreshold: verificationConfidenceThreshold,
            }
          );
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
              schemaVersion: '2.1.0',
              verificationEngineVersion: verificationV2 ? 'contrast-v2' : 'contrast-v1',
              generatedAt: new Date().toISOString(),
              tools: selectedTools,
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
              qualityGateResults: {
                passed: ctx.thresholdResult.passed,
                failures: ctx.thresholdResult.failures,
                counts: ctx.thresholdResult.counts,
              },
              thresholdScope: 'selected-tools-only',
              compliance: {
                includeManualChecks,
              },
              verification: {
                v2: verificationV2,
                deterministic: verificationDeterministic,
                confidenceThreshold: verificationConfidenceThreshold,
                gridSize: verificationGridSize,
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
      selectedTools,
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
