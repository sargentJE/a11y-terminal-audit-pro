#!/usr/bin/env node
/**
 * scripts/validate-report.js
 * -----------------------------------------------------------------------------
 * Systematically validate a previously-generated audit report by re-running
 * axe-core + Pa11y on the same routes and comparing rule/selector matches.
 *
 * This is NOT a replacement for manual testing. It answers:
 * - Are the reported issues reproducible right now on the live site?
 * - If not, did selectors change, or did the rule disappear?
 *
 * Usage:
 *   node scripts/validate-report.js --report <path-to-audit.json> [--outDir <dir>]
 */

import fs from 'fs-extra';
import path from 'node:path';

import BrowserManager from '../utils/BrowserManager.js';

function getArg(args, name, fallback = null) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return fallback;
  return next;
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function truncate(str, max = 600) {
  const s = String(str || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * Pa11y (HTMLCS) only supports WCAG2A/AA/AAA. Down-level any WCAG 2.1/2.2 label.
 *
 * @param {string} standard
 * @returns {'WCAG2A'|'WCAG2AA'|'WCAG2AAA'}
 */
function toPa11yStandard(standard) {
  const s = String(standard || '').toUpperCase();
  if (s.includes('AAA')) return 'WCAG2AAA';
  if (s.endsWith('AA')) return 'WCAG2AA';
  return 'WCAG2A';
}

/**
 * @param {any[]} unifiedIssues
 * @returns {{ engines: Set<string>, axeRuleId: string|null, pa11yCode: string|null }}
 */
function extractIssueKeys(issue) {
  const engines = new Set(issue?.corroboratedBy || [issue?.tool].filter(Boolean));
  const axeRuleId =
    issue?.engineMeta?.ruleId ||
    issue?.engineMeta?.auditId ||
    null;
  const pa11yCode = issue?.engineMeta?.ruleCode || null;
  return { engines, axeRuleId, pa11yCode };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {Map<string, any>} selectorCache
 * @returns {Promise<{ exists: boolean, outerHTML: string|null }>}
 */
async function getElementSnapshot(page, selector, selectorCache) {
  if (!selector) return { exists: false, outerHTML: null };
  if (selectorCache.has(selector)) return selectorCache.get(selector);

  try {
    const outerHTML = await page.$eval(selector, (el) => el.outerHTML);
    const res = { exists: true, outerHTML: truncate(outerHTML, 800) };
    selectorCache.set(selector, res);
    return res;
  } catch {
    const res = { exists: false, outerHTML: null };
    selectorCache.set(selector, res);
    return res;
  }
}

/**
 * @param {import('puppeteer').Page} page
 * @param {string} xpath
 * @returns {Promise<boolean>}
 */
async function xpathExists(page, xpath) {
  if (!xpath) return false;
  try {
    const handles = await page.$x(xpath);
    if (!handles || handles.length === 0) return false;
    await Promise.all(handles.map((h) => h.dispose().catch(() => {})));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {any} axeResults
 * @returns {Map<string, Array<{ targets: string[], html: string }>>}
 */
function indexAxeViolations(axeResults) {
  const map = new Map();
  const violations = axeResults?.violations || [];
  for (const v of violations) {
    const nodes = (v.nodes || []).map((n) => ({
      targets: (n.target || []).map(String),
      html: String(n.html || ''),
    }));
    map.set(String(v.id), nodes);
  }
  return map;
}

/**
 * @param {any} pa11yResults
 * @returns {Map<string, Set<string>>}
 */
function indexPa11yIssues(pa11yResults) {
  const map = new Map();
  const issues = pa11yResults?.issues || [];
  for (const i of issues) {
    const code = String(i.code || '');
    const selector = String(i.selector || '');
    if (!code) continue;
    if (!map.has(code)) map.set(code, new Set());
    if (selector) map.get(code).add(selector);
  }
  return map;
}

/**
 * @param {object} params
 * @param {string} params.url
 * @param {any[]} params.issues
 * @param {{ browser: import('puppeteer').Browser }} params.instance
 * @param {number} params.timeoutMs
 * @param {string} params.standard
 * @returns {Promise<{ url: string, validation: any[], errors: any }>}
 */
async function validateRoute({ url, issues, instance, timeoutMs, standard }) {
  const page = await instance.browser.newPage();
  await page.setCacheEnabled(true);
  await page.setViewport({ width: 1280, height: 800 });

  /** @type {Record<string, any>} */
  const errors = {};

  const selectorCache = new Map();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForNetworkIdle({ idleTime: 750, timeout: 10_000 }).catch(() => {});
  } catch (err) {
    errors.navigation = { message: err?.message || String(err) };
  }

  let axeResults = null;
  try {
    const axeMod = await import('@axe-core/puppeteer');
    const { AxePuppeteer } = axeMod;
    axeResults = await new AxePuppeteer(page).analyze();
  } catch (err) {
    errors.axe = { message: err?.message || String(err) };
  }

  let pa11yResults = null;
  try {
    const pa11yMod = await import('pa11y');
    const pa11y = pa11yMod.default || pa11yMod;
    pa11yResults = await pa11y(url, {
      browser: instance.browser,
      timeout: timeoutMs,
      standard: toPa11yStandard(standard),
      runners: ['htmlcs'],
      includeNotices: false,
      includeWarnings: true,
    });
  } catch (err) {
    errors.pa11y = { message: err?.message || String(err) };
  }

  const axeIndex = indexAxeViolations(axeResults);
  const pa11yIndex = indexPa11yIssues(pa11yResults);

  const validations = [];
  for (const issue of issues) {
    const { engines, axeRuleId, pa11yCode } = extractIssueKeys(issue);
    const selector = issue?.selector || issue?.evidence?.locator?.selector || null;
    const xpath = issue?.evidence?.locator?.xpath || null;

    const locator = {
      selector,
      selectorExists: false,
      xpath,
      xpathExists: false,
    };

    if (selector) {
      const snap = await getElementSnapshot(page, selector, selectorCache);
      locator.selectorExists = snap.exists;
      locator.outerHTML = snap.outerHTML;
    }
    if (!locator.selectorExists && xpath) {
      locator.xpathExists = await xpathExists(page, xpath);
    }

    const reproducedBy = {
      axe: null,
      pa11y: null,
    };

    if (engines.has('axe') || engines.has('lighthouse')) {
      if (axeRuleId && axeIndex.has(axeRuleId)) {
        const nodes = axeIndex.get(axeRuleId) || [];
        if (!selector) {
          reproducedBy.axe = { reproduced: true, match: 'rule' };
        } else {
          const exact = nodes.some((n) => (n.targets || []).includes(selector));
          const partial = !exact && nodes.some((n) => (n.targets || []).some((t) => t.includes(selector)));
          if (exact) reproducedBy.axe = { reproduced: true, match: 'selector-exact' };
          else if (partial) reproducedBy.axe = { reproduced: true, match: 'selector-contains' };
          else reproducedBy.axe = { reproduced: true, match: 'rule-only' };
        }
      } else if (axeRuleId) {
        reproducedBy.axe = { reproduced: false, match: 'none' };
      }
    }

    if (engines.has('pa11y')) {
      if (pa11yCode) {
        const selectors = pa11yIndex.get(pa11yCode);
        if (!selectors) {
          reproducedBy.pa11y = { reproduced: false, match: 'none' };
        } else if (!selector) {
          reproducedBy.pa11y = { reproduced: true, match: 'code' };
        } else if (selectors.has(selector)) {
          reproducedBy.pa11y = { reproduced: true, match: 'code+selector' };
        } else {
          // Selector might differ across runs; code match still matters.
          reproducedBy.pa11y = { reproduced: true, match: 'code-only' };
        }
      }
    }

    const anyReproduced =
      (reproducedBy.axe && reproducedBy.axe.reproduced === true) ||
      (reproducedBy.pa11y && reproducedBy.pa11y.reproduced === true);

    let status = 'unverifiable';
    if (anyReproduced) {
      status = 'reproduced';
      if (locator.selectorExists === false && locator.xpathExists === false) {
        status = 'reproduced_locator_missing';
      }
    } else if (
      (reproducedBy.axe && reproducedBy.axe.reproduced === false) ||
      (reproducedBy.pa11y && reproducedBy.pa11y.reproduced === false)
    ) {
      status = 'not_reproduced';
    }

    validations.push({
      id: issue.id,
      url: issue.url,
      tool: issue.tool,
      severityLabel: issue.severityLabel,
      message: issue.message,
      wcagCriteria: issue.wcagCriteria,
      corroboratedBy: Array.from(engines),
      keys: { axeRuleId, pa11yCode },
      locator,
      reproducedBy,
      status,
    });
  }

  await page.close().catch(() => {});
  return { url, validation: validations, errors };
}

function buildSummary(payload) {
  const all = payload.routes.flatMap((r) => r.validation);
  const byStatus = {};
  for (const row of all) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  const byRule = new Map();
  for (const row of all) {
    const rule = row.keys?.axeRuleId || row.keys?.pa11yCode || 'unknown';
    if (!byRule.has(rule)) byRule.set(rule, { total: 0, reproduced: 0, notReproduced: 0 });
    const bucket = byRule.get(rule);
    bucket.total++;
    if (row.status.startsWith('reproduced')) bucket.reproduced++;
    if (row.status === 'not_reproduced') bucket.notReproduced++;
  }

  const topUnstable = Array.from(byRule.entries())
    .map(([rule, v]) => ({
      rule,
      total: v.total,
      notReproduced: v.notReproduced,
      notReproducedPct: v.total > 0 ? Math.round((v.notReproduced / v.total) * 100) : 0,
    }))
    .filter((r) => r.notReproduced > 0 && r.total >= 10)
    .sort((a, b) => b.notReproducedPct - a.notReproducedPct)
    .slice(0, 15);

  return {
    totals: {
      issues: all.length,
      routes: payload.routes.length,
    },
    byStatus,
    topUnstableRules: topUnstable,
  };
}

function toMarkdown(payload) {
  const summary = payload.summary;
  const lines = [];
  lines.push(`# Validation Summary`);
  lines.push('');
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Report: ${payload.sourceReport}`);
  lines.push(`Routes validated: ${summary.totals.routes}`);
  lines.push(`Issues validated: ${summary.totals.issues}`);
  lines.push('');

  lines.push(`## Status Counts`);
  lines.push('');
  for (const [k, v] of Object.entries(summary.byStatus).sort((a, b) => b[1] - a[1])) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push('');

  if (summary.topUnstableRules.length > 0) {
    lines.push(`## Most Unstable Rules (>=10 occurrences)`);
    lines.push('');
    for (const r of summary.topUnstableRules) {
      lines.push(`- \`${r.rule}\`: ${r.notReproduced}/${r.total} not reproduced (${r.notReproducedPct}%)`);
    }
    lines.push('');
  }

  lines.push(`## Route Errors`);
  lines.push('');
  const anyErrors = payload.routes.some((r) => r.errors && Object.keys(r.errors).length > 0);
  if (!anyErrors) {
    lines.push(`- None`);
    lines.push('');
  } else {
    for (const r of payload.routes) {
      const keys = Object.keys(r.errors || {});
      if (keys.length === 0) continue;
      lines.push(`- ${r.url}: ${keys.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`## Next Steps`);
  lines.push('');
  lines.push(`- Open the HTML report and spot-check any \`not_reproduced\` items; some are transient or timing-dependent.`);
  lines.push(`- For critical flows (nav/search/projects), do manual keyboard and screen reader passes; automated validation can’t cover interaction issues.`);
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const reportPath = getArg(argv, 'report');
  if (!reportPath) {
    console.error('Missing --report <path-to-audit.json>');
    process.exit(2);
  }

  const timeoutMs = Number(getArg(argv, 'timeout', '90000'));
  const outDir = getArg(argv, 'outDir', path.dirname(reportPath));

  const raw = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(raw);

  const routes = report?.results || [];
  const standard = report?.meta?.standard || 'WCAG2AA';

  const instance = await BrowserManager.create({
    noSandbox: process.env.A11Y_NO_SANDBOX === '1' || process.env.CI === 'true',
  });

  const stamp = isoStamp();
  const outputJson = path.join(outDir, `validation-${stamp}.json`);
  const outputMd = path.join(outDir, `validation-${stamp}.md`);

  /** @type {any[]} */
  const validatedRoutes = [];

  try {
    for (const route of routes) {
      const url = route.url;
      const issues = Array.isArray(route.unifiedIssues) ? route.unifiedIssues : [];
      // Skip route if the report had no issues (unlikely, but keeps it safe).
      if (!url || issues.length === 0) {
        validatedRoutes.push({ url, validation: [], errors: {} });
        continue;
      }

      if (!hasFlag(argv, 'quiet')) console.log(`Validating: ${url} (${issues.length} issues)`);
      const validated = await validateRoute({ url, issues, instance, timeoutMs, standard });
      validatedRoutes.push(validated);
    }
  } finally {
    await BrowserManager.destroy().catch(() => {});
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceReport: reportPath,
    standard,
    timeoutMs,
    routes: validatedRoutes,
  };
  payload.summary = buildSummary(payload);

  await fs.ensureDir(outDir);
  await fs.writeJson(outputJson, payload, { spaces: 2 });
  await fs.writeFile(outputMd, toMarkdown(payload), 'utf8');

  console.log(`\nWrote:\n- ${outputJson}\n- ${outputMd}\n`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
