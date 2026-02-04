/**
 * utils/ReportGenerator.js
 * -----------------------------------------------------------------------------
 * Multi-format report generator for accessibility audit results.
 *
 * Supported formats:
 * - JSON: Full structured data
 * - HTML: Interactive report with Lighthouse-style visualizations
 * - CSV: Spreadsheet-compatible issue list
 * - SARIF: Static Analysis Results Interchange Format (GitHub/VS Code compatible)
 */

import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { defaultLogger as log } from './Logger.js';

/**
 * @typedef {import('./SeverityMapper.js').UnifiedIssue} UnifiedIssue
 * @typedef {import('./WCAGCompliance.js').ComplianceResult} ComplianceResult
 */

/**
 * @typedef {Object} AuditResult
 * @property {string} url
 * @property {string} startedAt
 * @property {number} durationMs
 * @property {number|null} lhScore
 * @property {number|null} axeViolations
 * @property {number|null} pa11yIssues
 * @property {UnifiedIssue[]} unifiedIssues
 * @property {number} totalIssues
 * @property {Object} [lighthouse]
 * @property {Object} [axe]
 * @property {Object} [pa11y]
 * @property {Object} errors
 */

/**
 * @typedef {Object} ReportData
 * @property {Object} meta - Report metadata
 * @property {AuditResult[]} results - Per-page audit results
 * @property {ComplianceResult} compliance - Overall compliance calculation
 */

export class ReportGenerator {
  /**
   * Generate reports in the specified formats.
   *
   * @param {ReportData} data - Report data
   * @param {string} outDir - Output directory
   * @param {string[]} formats - Formats to generate: 'json', 'html', 'csv', 'sarif'
   * @param {string} baseFilename - Base filename without extension
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.openHtml=false] - Auto-open HTML report in browser
   * @returns {Promise<string[]>} - Paths to generated files
   */
  static async generate(data, outDir, formats, baseFilename, options = {}) {
    await fs.ensureDir(outDir);
    const generatedFiles = [];
    let htmlPath = null;

    for (const format of formats) {
      const filepath = path.join(outDir, `${baseFilename}.${format}`);

      switch (format.toLowerCase()) {
        case 'json':
          await ReportGenerator.#generateJson(data, filepath);
          break;
        case 'html':
          await ReportGenerator.#generateHtml(data, filepath);
          htmlPath = filepath;
          break;
        case 'csv':
          await ReportGenerator.#generateCsv(data, filepath);
          break;
        case 'sarif':
          await ReportGenerator.#generateSarif(data, filepath);
          break;
        default:
          log.warn(`Unknown report format: ${format}`);
          continue;
      }

      generatedFiles.push(filepath);
      log.debug(`Generated ${format.toUpperCase()} report: ${filepath}`);
    }

    // Auto-open HTML report if requested
    if (options.openHtml && htmlPath) {
      ReportGenerator.#openInBrowser(htmlPath);
    }

    return generatedFiles;
  }

  /**
   * Open a file in the default browser.
   *
   * @private
   * @param {string} filepath
   */
  static #openInBrowser(filepath) {
    const absolutePath = path.resolve(filepath);
    const fileUrl = `file://${absolutePath}`;

    // Platform-specific open commands
    const platform = process.platform;
    let command;

    if (platform === 'darwin') {
      command = `open "${fileUrl}"`;
    } else if (platform === 'win32') {
      command = `start "" "${fileUrl}"`;
    } else {
      // Linux and others
      command = `xdg-open "${fileUrl}"`;
    }

    exec(command, (err) => {
      if (err) {
        log.debug(`Could not open browser: ${err.message}`);
      } else {
        log.info(`Opened HTML report in browser`);
      }
    });
  }

  /**
   * Generate JSON report.
   *
   * @private
   * @param {ReportData} data
   * @param {string} filepath
   */
  static async #generateJson(data, filepath) {
    await fs.outputJson(filepath, data, { spaces: 2 });
  }

  /**
   * Generate HTML report with Lighthouse-style visualizations.
   *
   * @private
   * @param {ReportData} data
   * @param {string} filepath
   */
  static async #generateHtml(data, filepath) {
    const { meta, results, compliance } = data;

    // Collect all unified issues across all pages
    const allIssues = results.flatMap((r) => r.unifiedIssues || []);

    // Calculate average Lighthouse score
    const lhScores = results.filter((r) => r.lhScore !== null).map((r) => r.lhScore);
    const avgLhScore = lhScores.length > 0
      ? Math.round(lhScores.reduce((a, b) => a + b, 0) / lhScores.length)
      : null;

    // Group issues by severity
    const issuesBySeverity = {
      critical: allIssues.filter((i) => i.severityLabel === 'critical'),
      serious: allIssues.filter((i) => i.severityLabel === 'serious'),
      moderate: allIssues.filter((i) => i.severityLabel === 'moderate'),
      minor: allIssues.filter((i) => i.severityLabel === 'minor'),
    };

    // Group issues by WCAG criteria
    const issuesByWcag = new Map();
    for (const issue of allIssues) {
      for (const criteria of (issue.wcagCriteria || [])) {
        const key = criteria.id;
        if (!issuesByWcag.has(key)) {
          issuesByWcag.set(key, { criteria, issues: [] });
        }
        issuesByWcag.get(key).issues.push(issue);
      }
    }

    // Get score color class
    const getScoreClass = (score) => {
      if (score >= 90) return 'score-good';
      if (score >= 50) return 'score-average';
      return 'score-poor';
    };

    // Get compliance level color class
    const getComplianceLevelClass = (level) => {
      if (level === 'AAA') return 'score-good';
      if (level === 'AA') return 'score-good';
      if (level === 'A') return 'score-average';
      return 'score-poor';
    };

    // Calculate overall accessibility score (weighted average of all metrics)
    const overallAccessibilityScore = Math.round(
      (avgLhScore !== null ? avgLhScore * 0.4 : 0) + 
      (compliance.score * 0.6)
    );

    // Generate gauge SVG
    const generateGauge = (score, label, size = 96) => {
      const circumference = 2 * Math.PI * 42;
      const offset = circumference - (score / 100) * circumference;
      const colorClass = getScoreClass(score);

      return `
        <div class="gauge-container">
          <svg class="gauge ${colorClass}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            <circle class="gauge-bg" cx="${size/2}" cy="${size/2}" r="42" />
            <circle class="gauge-fill" cx="${size/2}" cy="${size/2}" r="42" 
                    stroke-dasharray="${circumference}" 
                    stroke-dashoffset="${offset}"
                    transform="rotate(-90 ${size/2} ${size/2})" />
            <text class="gauge-score" x="${size/2}" y="${size/2}" dominant-baseline="central" text-anchor="middle">
              ${score}
            </text>
          </svg>
          <div class="gauge-label">${label}</div>
        </div>
      `;
    };

    // Generate compliance level gauge (shows A, AA, AAA, or the target with fail indicator)
    const generateComplianceLevelGauge = (level, targetStandard, size = 96) => {
      const colorClass = getComplianceLevelClass(level);
      
      // Determine what to display
      let displayText;
      let sublabel = 'WCAG Level';
      let fillPercent;
      
      if (level === 'Non-Conformant') {
        // Show the target level from the standard with a fail indicator
        // Extract target level from standard (e.g., "WCAG2AA" -> "AA")
        const targetMatch = (targetStandard || 'WCAG2AA').match(/WCAG2?\.?[12]?(A{1,3})/i);
        const targetLevel = targetMatch ? targetMatch[1].toUpperCase() : 'AA';
        displayText = targetLevel;
        sublabel = 'Target (Failing)';
        fillPercent = 0; // Empty ring to indicate failure
      } else {
        displayText = level;
        sublabel = 'WCAG Level';
        fillPercent = level === 'A' ? 33 : level === 'AA' ? 66 : 100;
      }
      
      const circumference = 2 * Math.PI * 42;
      const offset = circumference - (fillPercent / 100) * circumference;

      return `
        <div class="gauge-container">
          <svg class="gauge ${colorClass}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            <circle class="gauge-bg" cx="${size/2}" cy="${size/2}" r="42" />
            <circle class="gauge-fill" cx="${size/2}" cy="${size/2}" r="42" 
                    stroke-dasharray="${circumference}" 
                    stroke-dashoffset="${offset}"
                    transform="rotate(-90 ${size/2} ${size/2})" />
            <text class="gauge-score gauge-level-text" x="${size/2}" y="${size/2}" dominant-baseline="central" text-anchor="middle">
              ${displayText}
            </text>
          </svg>
          <div class="gauge-label">${sublabel}</div>
        </div>
      `;
    };

    // Generate issue card HTML
    const generateIssueCard = (issue, index) => {
      const wcagTags = (issue.wcagCriteria || [])
        .map((c) => `<span class="lh-tag lh-tag--${c.level?.toLowerCase() || 'unknown'}">${c.id} (${c.level})</span>`)
        .join('');

      return `
        <details class="lh-audit lh-audit--${issue.severityLabel}" ${index < 3 ? 'open' : ''}>
          <summary class="lh-audit__header">
            <span class="lh-audit__icon lh-audit__icon--${issue.severityLabel}"></span>
            <span class="lh-audit__title">${ReportGenerator.#escapeHtml(issue.message)}</span>
            <span class="lh-audit__tool">${issue.tool}</span>
          </summary>
          <div class="lh-audit__body">
            <div class="lh-audit__detail">
              <strong>URL:</strong> <a href="${ReportGenerator.#escapeHtml(issue.url)}" target="_blank">${ReportGenerator.#escapeHtml(issue.url)}</a>
            </div>
            ${issue.selector ? `
              <div class="lh-audit__detail">
                <strong>Selector:</strong> <code class="lh-code">${ReportGenerator.#escapeHtml(issue.selector)}</code>
              </div>
            ` : ''}
            ${issue.html ? `
              <div class="lh-audit__detail">
                <strong>Element:</strong>
                <pre class="lh-snippet">${ReportGenerator.#escapeHtml(issue.html)}</pre>
              </div>
            ` : ''}
            ${issue.help ? `
              <div class="lh-audit__detail">
                <strong>How to fix:</strong> ${ReportGenerator.#escapeHtml(issue.help)}
              </div>
            ` : ''}
            ${wcagTags ? `
              <div class="lh-audit__detail">
                <strong>WCAG Criteria:</strong> ${wcagTags}
              </div>
            ` : ''}
            ${issue.helpUrl ? `
              <div class="lh-audit__detail">
                <a href="${ReportGenerator.#escapeHtml(issue.helpUrl)}" target="_blank" class="lh-link">Learn more ↗</a>
              </div>
            ` : ''}
          </div>
        </details>
      `;
    };

    // Generate page summary rows
    const pageRowsHtml = results.map((r, idx) => {
      const issueCount = r.unifiedIssues?.length || 0;
      const hasErrors = r.errors && Object.keys(r.errors).length > 0;
      return `
        <details class="lh-page-audit" ${idx === 0 ? 'open' : ''}>
          <summary class="lh-page-header">
            <span class="lh-page-url">${ReportGenerator.#escapeHtml(r.url)}</span>
            <span class="lh-page-metrics">
              ${r.lhScore !== null ? `<span class="lh-metric ${getScoreClass(r.lhScore)}">LH: ${r.lhScore}%</span>` : ''}
              <span class="lh-metric">Issues: ${issueCount}</span>
              <span class="lh-metric">${Math.round(r.durationMs / 1000)}s</span>
              ${hasErrors ? '<span class="lh-metric lh-metric--error">⚠ Errors</span>' : ''}
            </span>
          </summary>
          <div class="lh-page-body">
            <div class="lh-page-stats">
              <div class="lh-stat">
                <div class="lh-stat-value ${r.lhScore !== null ? getScoreClass(r.lhScore) : ''}">${r.lhScore !== null ? r.lhScore + '%' : 'N/A'}</div>
                <div class="lh-stat-label">Lighthouse</div>
              </div>
              <div class="lh-stat">
                <div class="lh-stat-value">${r.axeViolations ?? 'N/A'}</div>
                <div class="lh-stat-label">Axe Violations</div>
              </div>
              <div class="lh-stat">
                <div class="lh-stat-value">${r.pa11yIssues ?? 'N/A'}</div>
                <div class="lh-stat-label">Pa11y Issues</div>
              </div>
            </div>
            ${(r.unifiedIssues || []).length > 0 ? `
              <div class="lh-page-issues">
                <h4>Issues on this page:</h4>
                ${(r.unifiedIssues || []).slice(0, 10).map((issue, i) => generateIssueCard(issue, i)).join('')}
                ${(r.unifiedIssues || []).length > 10 ? `<p class="lh-more">...and ${(r.unifiedIssues || []).length - 10} more issues</p>` : ''}
              </div>
            ` : '<p class="lh-success">✓ No issues found on this page</p>'}
          </div>
        </details>
      `;
    }).join('');

    // Generate WCAG criteria summary
    const wcagSummaryHtml = Array.from(issuesByWcag.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, { criteria, issues }]) => `
        <details class="lh-wcag-criterion">
          <summary class="lh-wcag-header">
            <span class="lh-tag lh-tag--${criteria.level?.toLowerCase() || 'unknown'}">${criteria.level}</span>
            <span class="lh-wcag-id">${id}</span>
            <span class="lh-wcag-name">${ReportGenerator.#escapeHtml(criteria.name || '')}</span>
            <span class="lh-wcag-count">${issues.length} issue${issues.length !== 1 ? 's' : ''}</span>
          </summary>
          <div class="lh-wcag-body">
            ${issues.slice(0, 5).map((issue, i) => generateIssueCard(issue, i)).join('')}
            ${issues.length > 5 ? `<p class="lh-more">...and ${issues.length - 5} more issues</p>` : ''}
          </div>
        </details>
      `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report - ${ReportGenerator.#escapeHtml(meta.baseUrl)}</title>
  <style>
    :root {
      --color-good: #0cce6b;
      --color-good-bg: rgba(12, 206, 107, 0.1);
      --color-average: #ffa400;
      --color-average-bg: rgba(255, 164, 0, 0.1);
      --color-poor: #ff4e42;
      --color-poor-bg: rgba(255, 78, 66, 0.1);
      --color-critical: #ff4e42;
      --color-serious: #f97316;
      --color-moderate: #eab308;
      --color-minor: #22c55e;
      --color-bg: #ffffff;
      --color-bg-secondary: #f5f6f7;
      --color-border: #e0e0e0;
      --color-text: #212121;
      --color-text-secondary: #757575;
      --color-link: #1a73e8;
      --lh-audit-group-padding: 16px;
      --font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-family);
      font-size: 14px;
      line-height: 1.6;
      color: var(--color-text);
      background: var(--color-bg-secondary);
    }

    .lh-root {
      max-width: 1200px;
      margin: 0 auto;
      background: var(--color-bg);
    }

    /* Header */
    .lh-header {
      background: linear-gradient(135deg, #1a237e 0%, #303f9f 100%);
      color: white;
      padding: 24px 32px;
    }

    .lh-header__title {
      font-size: 24px;
      font-weight: 400;
      margin-bottom: 8px;
    }

    .lh-header__url {
      font-size: 14px;
      opacity: 0.9;
      word-break: break-all;
    }

    .lh-header__meta {
      margin-top: 16px;
      font-size: 12px;
      opacity: 0.7;
    }

    /* Scores Section */
    .lh-scores {
      display: flex;
      justify-content: center;
      gap: 48px;
      padding: 32px;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      flex-wrap: wrap;
    }

    .gauge-container {
      text-align: center;
    }

    .gauge {
      transform: rotate(0deg);
    }

    .gauge-bg {
      fill: none;
      stroke: var(--color-border);
      stroke-width: 4;
    }

    .gauge-fill {
      fill: none;
      stroke-width: 4;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.5s ease;
    }

    .gauge.score-good .gauge-fill { stroke: var(--color-good); }
    .gauge.score-average .gauge-fill { stroke: var(--color-average); }
    .gauge.score-poor .gauge-fill { stroke: var(--color-poor); }

    .gauge-score {
      font-size: 28px;
      font-weight: 500;
      fill: var(--color-text);
    }

    .gauge.score-good .gauge-score { fill: var(--color-good); }
    .gauge.score-average .gauge-score { fill: var(--color-average); }
    .gauge.score-poor .gauge-score { fill: var(--color-poor); }

    .gauge-level-text {
      font-size: 24px;
      font-weight: 700;
    }

    .gauge-label {
      margin-top: 8px;
      font-size: 14px;
      color: var(--color-text-secondary);
    }

    /* Compliance Badge */
    .lh-compliance {
      text-align: center;
      padding: 24px;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
    }

    .lh-compliance-badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 16px 32px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 500;
    }

    .lh-compliance-badge.level-AAA { background: var(--color-good-bg); color: var(--color-good); }
    .lh-compliance-badge.level-AA { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    .lh-compliance-badge.level-A { background: var(--color-average-bg); color: var(--color-average); }
    .lh-compliance-badge.level-Non-Conformant { background: var(--color-poor-bg); color: var(--color-poor); }

    .lh-compliance-icon {
      font-size: 24px;
    }

    .lh-compliance-text {
      text-align: left;
    }

    .lh-compliance-level {
      font-size: 24px;
      font-weight: 700;
    }

    .lh-compliance-desc {
      font-size: 12px;
      opacity: 0.8;
    }

    /* Summary Cards */
    .lh-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      padding: 24px;
      background: var(--color-bg-secondary);
    }

    .lh-summary-card {
      background: var(--color-bg);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .lh-summary-value {
      font-size: 32px;
      font-weight: 500;
    }

    .lh-summary-label {
      font-size: 12px;
      color: var(--color-text-secondary);
      margin-top: 4px;
    }

    .lh-summary-card.critical .lh-summary-value { color: var(--color-critical); }
    .lh-summary-card.serious .lh-summary-value { color: var(--color-serious); }
    .lh-summary-card.moderate .lh-summary-value { color: var(--color-moderate); }
    .lh-summary-card.minor .lh-summary-value { color: var(--color-minor); }

    /* Navigation Tabs */
    .lh-tabs {
      display: flex;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      overflow-x: auto;
    }

    .lh-tab {
      padding: 16px 24px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text-secondary);
      border-bottom: 3px solid transparent;
      white-space: nowrap;
    }

    .lh-tab:hover {
      color: var(--color-text);
      background: var(--color-bg-secondary);
    }

    .lh-tab.active {
      color: var(--color-link);
      border-bottom-color: var(--color-link);
    }

    /* Tab Content */
    .lh-tab-content {
      display: none;
      padding: 24px;
    }

    .lh-tab-content.active {
      display: block;
    }

    /* Section Headers */
    .lh-section-header {
      font-size: 18px;
      font-weight: 500;
      padding-bottom: 16px;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .lh-section-count {
      background: var(--color-bg-secondary);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    /* Audit Items */
    .lh-audit {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .lh-audit__header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      background: var(--color-bg);
    }

    .lh-audit__header:hover {
      background: var(--color-bg-secondary);
    }

    .lh-audit__icon {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .lh-audit__icon--critical { background: var(--color-critical); }
    .lh-audit__icon--serious { background: var(--color-serious); }
    .lh-audit__icon--moderate { background: var(--color-moderate); }
    .lh-audit__icon--minor { background: var(--color-minor); }

    .lh-audit__title {
      flex: 1;
      font-weight: 500;
    }

    .lh-audit__tool {
      font-size: 12px;
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .lh-audit__body {
      padding: 16px;
      background: var(--color-bg-secondary);
      border-top: 1px solid var(--color-border);
    }

    .lh-audit__detail {
      margin-bottom: 12px;
    }

    .lh-audit__detail:last-child {
      margin-bottom: 0;
    }

    .lh-audit__detail strong {
      color: var(--color-text-secondary);
      font-weight: 500;
    }

    /* Code and Snippets */
    .lh-code {
      background: #263238;
      color: #80cbc4;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Roboto Mono', monospace;
      font-size: 12px;
      word-break: break-all;
    }

    .lh-snippet {
      background: #263238;
      color: #adbac7;
      padding: 12px;
      border-radius: 4px;
      font-family: 'Roboto Mono', monospace;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Tags */
    .lh-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin: 2px;
    }

    .lh-tag--a { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .lh-tag--aa { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
    .lh-tag--aaa { background: rgba(236, 72, 153, 0.15); color: #ec4899; }
    .lh-tag--unknown { background: var(--color-bg-secondary); color: var(--color-text-secondary); }

    /* Links */
    .lh-link {
      color: var(--color-link);
      text-decoration: none;
    }

    .lh-link:hover {
      text-decoration: underline;
    }

    /* Page Audit */
    .lh-page-audit {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .lh-page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--color-bg);
      cursor: pointer;
      gap: 16px;
    }

    .lh-page-header:hover {
      background: var(--color-bg-secondary);
    }

    .lh-page-url {
      font-weight: 500;
      word-break: break-all;
      flex: 1;
    }

    .lh-page-metrics {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .lh-metric {
      padding: 4px 8px;
      background: var(--color-bg-secondary);
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
    }

    .lh-metric.score-good { background: var(--color-good-bg); color: var(--color-good); }
    .lh-metric.score-average { background: var(--color-average-bg); color: var(--color-average); }
    .lh-metric.score-poor { background: var(--color-poor-bg); color: var(--color-poor); }
    .lh-metric--error { background: var(--color-poor-bg); color: var(--color-poor); }

    .lh-page-body {
      padding: 16px;
      background: var(--color-bg-secondary);
      border-top: 1px solid var(--color-border);
    }

    .lh-page-stats {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }

    .lh-stat {
      text-align: center;
    }

    .lh-stat-value {
      font-size: 24px;
      font-weight: 500;
    }

    .lh-stat-value.score-good { color: var(--color-good); }
    .lh-stat-value.score-average { color: var(--color-average); }
    .lh-stat-value.score-poor { color: var(--color-poor); }

    .lh-stat-label {
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    .lh-page-issues h4 {
      font-size: 14px;
      margin-bottom: 12px;
      color: var(--color-text-secondary);
    }

    .lh-success {
      color: var(--color-good);
      font-weight: 500;
    }

    .lh-more {
      padding: 12px;
      text-align: center;
      color: var(--color-text-secondary);
      font-style: italic;
    }

    /* WCAG Criteria */
    .lh-wcag-criterion {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .lh-wcag-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      background: var(--color-bg);
    }

    .lh-wcag-header:hover {
      background: var(--color-bg-secondary);
    }

    .lh-wcag-id {
      font-weight: 600;
      font-family: 'Roboto Mono', monospace;
    }

    .lh-wcag-name {
      flex: 1;
      color: var(--color-text-secondary);
    }

    .lh-wcag-count {
      background: var(--color-bg-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    .lh-wcag-body {
      padding: 16px;
      background: var(--color-bg-secondary);
      border-top: 1px solid var(--color-border);
    }

    /* Filters */
    .lh-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .lh-filter-btn {
      padding: 8px 16px;
      border: 1px solid var(--color-border);
      border-radius: 20px;
      background: var(--color-bg);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    .lh-filter-btn:hover {
      background: var(--color-bg-secondary);
    }

    .lh-filter-btn.active {
      background: var(--color-text);
      color: white;
      border-color: var(--color-text);
    }

    /* Footer */
    .lh-footer {
      padding: 24px;
      text-align: center;
      color: var(--color-text-secondary);
      font-size: 12px;
      background: var(--color-bg);
      border-top: 1px solid var(--color-border);
    }

    /* Print Styles */
    @media print {
      .lh-tabs, .lh-filters { display: none; }
      .lh-tab-content { display: block !important; }
      details { break-inside: avoid; }
      .lh-audit, .lh-page-audit, .lh-wcag-criterion { page-break-inside: avoid; }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .lh-scores { gap: 24px; padding: 24px 16px; }
      .gauge-container svg { width: 80px; height: 80px; }
      .lh-page-header { flex-direction: column; align-items: flex-start; }
      .lh-page-metrics { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <div class="lh-root">
    <!-- Header -->
    <header class="lh-header">
      <h1 class="lh-header__title">♿ Accessibility Report</h1>
      <div class="lh-header__url">${ReportGenerator.#escapeHtml(meta.baseUrl)}</div>
      <div class="lh-header__meta">
        Generated ${new Date(meta.generatedAt).toLocaleString()} • 
        ${results.length} page${results.length !== 1 ? 's' : ''} scanned • 
        Standard: ${meta.standard}
      </div>
    </header>

    <!-- Score Gauges -->
    <section class="lh-scores">
      ${generateGauge(overallAccessibilityScore, 'Overall Score')}
      ${generateComplianceLevelGauge(compliance.level, meta.standard)}
      ${avgLhScore !== null ? generateGauge(avgLhScore, 'Lighthouse') : ''}
      ${generateGauge(compliance.score, 'Compliance')}
    </section>

    <!-- Compliance Badge -->
    <section class="lh-compliance">
      <div class="lh-compliance-badge level-${compliance.level}">
        <span class="lh-compliance-icon">${compliance.level === 'Non-Conformant' ? '✗' : '✓'}</span>
        <div class="lh-compliance-text">
          <div class="lh-compliance-level">WCAG ${compliance.level}</div>
          <div class="lh-compliance-desc">${ReportGenerator.#escapeHtml(compliance.description)}</div>
        </div>
      </div>
    </section>

    <!-- Summary Cards -->
    <section class="lh-summary">
      <div class="lh-summary-card">
        <div class="lh-summary-value">${results.length}</div>
        <div class="lh-summary-label">Pages Scanned</div>
      </div>
      <div class="lh-summary-card">
        <div class="lh-summary-value">${allIssues.length}</div>
        <div class="lh-summary-label">Total Issues</div>
      </div>
      <div class="lh-summary-card critical">
        <div class="lh-summary-value">${issuesBySeverity.critical.length}</div>
        <div class="lh-summary-label">Critical</div>
      </div>
      <div class="lh-summary-card serious">
        <div class="lh-summary-value">${issuesBySeverity.serious.length}</div>
        <div class="lh-summary-label">Serious</div>
      </div>
      <div class="lh-summary-card moderate">
        <div class="lh-summary-value">${issuesBySeverity.moderate.length}</div>
        <div class="lh-summary-label">Moderate</div>
      </div>
      <div class="lh-summary-card minor">
        <div class="lh-summary-value">${issuesBySeverity.minor.length}</div>
        <div class="lh-summary-label">Minor</div>
      </div>
    </section>

    <!-- Navigation Tabs -->
    <nav class="lh-tabs">
      <button class="lh-tab active" onclick="showTab('all-issues')">All Issues</button>
      <button class="lh-tab" onclick="showTab('by-page')">By Page</button>
      <button class="lh-tab" onclick="showTab('by-wcag')">By WCAG Criteria</button>
      <button class="lh-tab" onclick="showTab('metadata')">Report Info</button>
    </nav>

    <!-- All Issues Tab -->
    <div id="all-issues" class="lh-tab-content active">
      <div class="lh-section-header">
        All Accessibility Issues
        <span class="lh-section-count">${allIssues.length}</span>
      </div>

      <div class="lh-filters">
        <button class="lh-filter-btn active" onclick="filterIssues('all')">All (${allIssues.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues('critical')">Critical (${issuesBySeverity.critical.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues('serious')">Serious (${issuesBySeverity.serious.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues('moderate')">Moderate (${issuesBySeverity.moderate.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues('minor')">Minor (${issuesBySeverity.minor.length})</button>
      </div>

      <div id="issues-list">
        ${allIssues.slice(0, 100).map((issue, i) => generateIssueCard(issue, i)).join('')}
        ${allIssues.length > 100 ? `<p class="lh-more">Showing 100 of ${allIssues.length} issues. Export to CSV for full list.</p>` : ''}
      </div>
    </div>

    <!-- By Page Tab -->
    <div id="by-page" class="lh-tab-content">
      <div class="lh-section-header">
        Results by Page
        <span class="lh-section-count">${results.length}</span>
      </div>
      ${pageRowsHtml}
    </div>

    <!-- By WCAG Tab -->
    <div id="by-wcag" class="lh-tab-content">
      <div class="lh-section-header">
        Issues by WCAG Success Criteria
        <span class="lh-section-count">${issuesByWcag.size} criteria affected</span>
      </div>
      ${wcagSummaryHtml || '<p>No issues with mapped WCAG criteria.</p>'}
    </div>

    <!-- Metadata Tab -->
    <div id="metadata" class="lh-tab-content">
      <div class="lh-section-header">Report Information</div>
      <div class="lh-page-body" style="background: var(--color-bg);">
        <div class="lh-page-stats" style="flex-wrap: wrap; gap: 32px;">
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.version}</div>
            <div class="lh-stat-label">Tool Version</div>
          </div>
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.standard}</div>
            <div class="lh-stat-label">WCAG Standard</div>
          </div>
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.limit}</div>
            <div class="lh-stat-label">Page Limit</div>
          </div>
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.timeoutMs / 1000}s</div>
            <div class="lh-stat-label">Timeout</div>
          </div>
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.concurrency || 1}</div>
            <div class="lh-stat-label">Concurrency</div>
          </div>
        </div>
        <div style="margin-top: 24px;">
          <h4 style="margin-bottom: 12px;">Tools Used:</h4>
          <p>• Lighthouse (Accessibility Category)<br>• axe-core (via Puppeteer)<br>• Pa11y (HTMLCS Runner)</p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="lh-footer">
      Generated by A11Y Terminal Audit Pro v${meta.version}<br>
      <a href="https://github.com/example/a11y-terminal-audit-pro" class="lh-link">Documentation & Source</a>
    </footer>
  </div>

  <script>
    function showTab(tabId) {
      // Hide all tabs
      document.querySelectorAll('.lh-tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.lh-tab').forEach(el => el.classList.remove('active'));

      // Show selected tab
      document.getElementById(tabId).classList.add('active');
      event.target.classList.add('active');
    }

    function filterIssues(severity) {
      const issues = document.querySelectorAll('#issues-list .lh-audit');
      const btns = document.querySelectorAll('.lh-filter-btn');

      btns.forEach(btn => btn.classList.remove('active'));
      event.target.classList.add('active');

      issues.forEach(issue => {
        if (severity === 'all') {
          issue.style.display = '';
        } else {
          issue.style.display = issue.classList.contains('lh-audit--' + severity) ? '' : 'none';
        }
      });
    }
  </script>
</body>
</html>`;

    await fs.outputFile(filepath, html);
  }

  /**
   * Generate CSV report.
   *
   * @private
   * @param {ReportData} data
   * @param {string} filepath
   */
  static async #generateCsv(data, filepath) {
    const { results } = data;

    // Collect all unified issues
    const allIssues = results.flatMap((r) => r.unifiedIssues || []);

    // CSV headers
    const headers = [
      'Severity',
      'Severity Level',
      'Message',
      'Selector',
      'HTML',
      'URL',
      'WCAG Criteria',
      'WCAG Level',
      'Tool',
      'Help URL',
    ];

    // Generate CSV rows
    const rows = allIssues.map((issue) => {
      const wcagCriteria = (issue.wcagCriteria || []).map((c) => c.id).join('; ');
      const wcagLevels = [...new Set((issue.wcagCriteria || []).map((c) => c.level))].join('; ');

      return [
        issue.severityLabel,
        issue.severity,
        issue.message,
        issue.selector || '',
        issue.html || '',
        issue.url,
        wcagCriteria,
        wcagLevels,
        issue.tool,
        issue.helpUrl || '',
      ];
    });

    // Escape CSV values
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');

    await fs.outputFile(filepath, csv);
  }

  /**
   * Generate SARIF report (Static Analysis Results Interchange Format).
   * Compatible with GitHub Code Scanning and VS Code SARIF Viewer.
   *
   * @private
   * @param {ReportData} data
   * @param {string} filepath
   */
  static async #generateSarif(data, filepath) {
    const { meta, results } = data;

    // Collect all unified issues
    const allIssues = results.flatMap((r) => r.unifiedIssues || []);

    // Map severity to SARIF levels
    const severityToLevel = {
      critical: 'error',
      serious: 'error',
      moderate: 'warning',
      minor: 'note',
    };

    // Build SARIF rules from unique issues
    const rulesMap = new Map();
    for (const issue of allIssues) {
      const ruleId = issue.id.split('-').slice(0, 2).join('-');
      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: issue.message.substring(0, 100),
          shortDescription: {
            text: issue.message.substring(0, 200),
          },
          fullDescription: {
            text: issue.help || issue.message,
          },
          helpUri: issue.helpUrl || undefined,
          properties: {
            tags: (issue.wcagCriteria || []).map((c) => `WCAG${c.id}`),
          },
        });
      }
    }

    // Build SARIF results
    const sarifResults = allIssues.map((issue, _idx) => {
      const ruleId = issue.id.split('-').slice(0, 2).join('-');

      return {
        ruleId,
        ruleIndex: Array.from(rulesMap.keys()).indexOf(ruleId),
        level: severityToLevel[issue.severityLabel] || 'warning',
        message: {
          text: issue.message,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: issue.url,
              },
            },
            logicalLocations: issue.selector
              ? [
                  {
                    name: issue.selector,
                    kind: 'element',
                  },
                ]
              : undefined,
          },
        ],
        partialFingerprints: {
          primaryLocationLineHash: Buffer.from(
            `${issue.url}:${issue.selector}:${issue.message}`
          ).toString('base64').substring(0, 32),
        },
      };
    });

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'A11Y Terminal Audit Pro',
              version: meta.version,
              informationUri: 'https://github.com/example/a11y-terminal-audit-pro',
              rules: Array.from(rulesMap.values()),
            },
          },
          results: sarifResults,
          invocations: [
            {
              executionSuccessful: true,
              startTimeUtc: meta.generatedAt,
            },
          ],
        },
      ],
    };

    await fs.outputJson(filepath, sarif, { spaces: 2 });
  }

  /**
   * Escape HTML special characters.
   *
   * @private
   * @param {string} str
   * @returns {string}
   */
  static #escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default ReportGenerator;
