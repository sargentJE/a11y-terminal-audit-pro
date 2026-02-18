import fs from 'fs-extra';
import { escapeHtml } from '../shared/escapeHtml.js';
import { REPORT_HTML_STYLES } from './styles.js';
import { REPORT_HTML_CLIENT_SCRIPT } from './clientScript.js';
import {
  generateComplianceLevelGauge,
  generateGauge,
  generateIssueCard,
  getFindingKind,
  generatePageRowsHtml,
  generateWcagSummaryHtml,
} from './templateParts.js';

/**
 * Generate HTML report with Lighthouse-style visualizations.
 *
 * @param {{ meta: any, results: any[], compliance: any }} data
 * @param {string} filepath
 */
export async function generateHtmlReport(data, filepath) {
  const { meta, results, compliance } = data;

  const allIssues = results.flatMap((r) => r.unifiedIssues || []);
  const lhScores = results.filter((r) => r.lhScore !== null).map((r) => r.lhScore);
  const avgLhScore =
    lhScores.length > 0 ? Math.round(lhScores.reduce((a, b) => a + b, 0) / lhScores.length) : null;

  const issuesBySeverity = {
    critical: allIssues.filter((i) => i.severityLabel === 'critical'),
    serious: allIssues.filter((i) => i.severityLabel === 'serious'),
    moderate: allIssues.filter((i) => i.severityLabel === 'moderate'),
    minor: allIssues.filter((i) => i.severityLabel === 'minor'),
  };
  const issuesByFinding = {
    violation: allIssues.filter((i) => getFindingKind(i) === 'violation'),
    manualReview: allIssues.filter((i) => getFindingKind(i) === 'manual-review'),
  };

  const issuesByWcag = new Map();
  for (const issue of allIssues) {
    for (const criteria of issue.wcagCriteria || []) {
      const key = criteria.id;
      if (!issuesByWcag.has(key)) {
        issuesByWcag.set(key, { criteria, issues: [] });
      }
      issuesByWcag.get(key).issues.push(issue);
    }
  }

  const overallAccessibilityScore = Math.round(
    (avgLhScore !== null ? avgLhScore * 0.4 : 0) + (compliance.confirmedScore ?? compliance.score) * 0.6
  );

  const pageRowsHtml = generatePageRowsHtml(results);
  const wcagSummaryHtml = generateWcagSummaryHtml(issuesByWcag);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report - ${escapeHtml(meta.baseUrl)}</title>
  <style>${REPORT_HTML_STYLES}
  </style>
</head>
<body>
  <div class="lh-root">
    <!-- Header -->
    <header class="lh-header">
      <h1 class="lh-header__title">♿ Accessibility Report</h1>
      <div class="lh-header__url">${escapeHtml(meta.baseUrl)}</div>
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
      ${generateGauge(compliance.confirmedScore ?? compliance.score, 'Confirmed')}
      ${generateGauge(compliance.reportedScore ?? compliance.score, 'Reported')}
    </section>

    <!-- Compliance Badge -->
    <section class="lh-compliance">
      <div class="lh-compliance-badge level-${compliance.level}">
        <span class="lh-compliance-icon">${compliance.level === 'Non-Conformant' ? '✗' : '✓'}</span>
        <div class="lh-compliance-text">
          <div class="lh-compliance-level">WCAG ${compliance.level}</div>
          <div class="lh-compliance-desc">${escapeHtml(compliance.description)}</div>
        </div>
      </div>
      ${
        compliance.qualitySignals?.manualReviewDominates || compliance.qualitySignals?.lowConfidenceDominates
          ? `
      <div class="lh-evidence-note" style="margin-top: 12px;">
        <strong>Caution:</strong> report certainty is ${escapeHtml(
          String(compliance.qualitySignals?.certaintyLabel || 'low').toUpperCase()
        )}. ${(compliance.qualitySignals?.notes || []).map((note) => escapeHtml(note)).join(' ')}
      </div>`
          : ''
      }
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
      <div class="lh-summary-card serious">
        <div class="lh-summary-value">${issuesByFinding.violation.length}</div>
        <div class="lh-summary-label">Confirmed Violations</div>
      </div>
      <div class="lh-summary-card moderate">
        <div class="lh-summary-value">${issuesByFinding.manualReview.length}</div>
        <div class="lh-summary-label">Manual Review</div>
      </div>
      <div class="lh-summary-card minor">
        <div class="lh-summary-value">${compliance.summary.inconclusive ?? 0}</div>
        <div class="lh-summary-label">Inconclusive</div>
      </div>
      <div class="lh-summary-card serious">
        <div class="lh-summary-value">${compliance.summary.promoted ?? 0}</div>
        <div class="lh-summary-label">Promoted</div>
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
      <button class="lh-tab active" onclick="showTab(event, 'all-issues')">All Issues</button>
      <button class="lh-tab" onclick="showTab(event, 'by-page')">By Page</button>
      <button class="lh-tab" onclick="showTab(event, 'by-wcag')">By WCAG Criteria</button>
      <button class="lh-tab" onclick="showTab(event, 'metadata')">Report Info</button>
    </nav>

    <!-- All Issues Tab -->
    <div id="all-issues" class="lh-tab-content active">
      <div class="lh-section-header">
        All Accessibility Issues
        <span class="lh-section-count">${allIssues.length}</span>
      </div>

      <div class="lh-filters">
        <button class="lh-filter-btn active" onclick="filterIssues(event, 'all')">All (${allIssues.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'violation')">Violations (${issuesByFinding.violation.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'manual-review')">Manual Review (${issuesByFinding.manualReview.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'critical')">Critical (${issuesBySeverity.critical.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'serious')">Serious (${issuesBySeverity.serious.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'moderate')">Moderate (${issuesBySeverity.moderate.length})</button>
        <button class="lh-filter-btn" onclick="filterIssues(event, 'minor')">Minor (${issuesBySeverity.minor.length})</button>
      </div>

      <p class="lh-more" style="text-align:left;padding:0 0 12px 0;">
        Scoring policy: ${
          compliance.scoringPolicy?.includeManualChecks
            ? 'manual-review findings are included in compliance scoring.'
            : 'manual-review findings are excluded from compliance scoring by default.'
        } Confidence threshold: ${escapeHtml(compliance.scoringPolicy?.confidenceThreshold || 'high')}.
      </p>

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
            <div class="lh-stat-value">${meta.schemaVersion || '2.0.0'}</div>
            <div class="lh-stat-label">Schema Version</div>
          </div>
          <div class="lh-stat">
            <div class="lh-stat-value">${meta.verificationEngineVersion || 'contrast-v1'}</div>
            <div class="lh-stat-label">Verification Engine</div>
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

  <script>${REPORT_HTML_CLIENT_SCRIPT}
  </script>
</body>
</html>`;

  await fs.outputFile(filepath, html);
}

export default generateHtmlReport;
