import { escapeHtml } from '../shared/escapeHtml.js';

/**
 * @param {number} score
 * @returns {string}
 */
export function getScoreClass(score) {
  if (score >= 90) return 'score-good';
  if (score >= 50) return 'score-average';
  return 'score-poor';
}

/**
 * @param {string} level
 * @returns {string}
 */
export function getComplianceLevelClass(level) {
  if (level === 'AAA') return 'score-good';
  if (level === 'AA') return 'score-good';
  if (level === 'A') return 'score-average';
  return 'score-poor';
}

/**
 * @param {number} score
 * @param {string} label
 * @param {number} [size=96]
 * @returns {string}
 */
export function generateGauge(score, label, size = 96) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;
  const colorClass = getScoreClass(score);

  return `
    <div class="gauge-container">
      <svg class="gauge ${colorClass}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle class="gauge-bg" cx="${size / 2}" cy="${size / 2}" r="42" />
        <circle class="gauge-fill" cx="${size / 2}" cy="${size / 2}" r="42" 
                stroke-dasharray="${circumference}" 
                stroke-dashoffset="${offset}"
                transform="rotate(-90 ${size / 2} ${size / 2})" />
        <text class="gauge-score" x="${size / 2}" y="${size / 2}" dominant-baseline="central" text-anchor="middle">
          ${score}
        </text>
      </svg>
      <div class="gauge-label">${label}</div>
    </div>
  `;
}

/**
 * @param {string} level
 * @param {string} targetStandard
 * @param {number} [size=96]
 * @returns {string}
 */
export function generateComplianceLevelGauge(level, targetStandard, size = 96) {
  const colorClass = getComplianceLevelClass(level);

  let displayText;
  let sublabel = 'WCAG Level';
  let fillPercent;

  if (level === 'Non-Conformant') {
    const targetMatch = (targetStandard || 'WCAG2AA').match(/WCAG2?\.?[12]?(A{1,3})/i);
    const targetLevel = targetMatch ? targetMatch[1].toUpperCase() : 'AA';
    displayText = targetLevel;
    sublabel = 'Target (Failing)';
    fillPercent = 0;
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
        <circle class="gauge-bg" cx="${size / 2}" cy="${size / 2}" r="42" />
        <circle class="gauge-fill" cx="${size / 2}" cy="${size / 2}" r="42" 
                stroke-dasharray="${circumference}" 
                stroke-dashoffset="${offset}"
                transform="rotate(-90 ${size / 2} ${size / 2})" />
        <text class="gauge-score gauge-level-text" x="${size / 2}" y="${size / 2}" dominant-baseline="central" text-anchor="middle">
          ${displayText}
        </text>
      </svg>
      <div class="gauge-label">${sublabel}</div>
    </div>
  `;
}

/**
 * @param {any} issue
 * @returns {'violation'|'manual-review'}
 */
export function getFindingKind(issue) {
  if (issue.countsTowardCompliance === false || issue.findingKind === 'manual-review') {
    return 'manual-review';
  }
  return 'violation';
}

/**
 * @param {any} issue
 * @param {number} index
 * @returns {string}
 */
export function generateIssueCard(issue, index) {
  const wcagTags = (issue.wcagCriteria || [])
    .map((c) => `<span class="lh-tag lh-tag--${c.level?.toLowerCase() || 'unknown'}">${c.id} (${c.level})</span>`)
    .join('');
  const evidence = issue.evidence;
  const findingKind = getFindingKind(issue);
  const findingKindLabel = findingKind === 'manual-review' ? 'Manual Review' : 'Violation';
  const evidenceLabel = evidence
    ? `${String(evidence.confidence || 'low').toUpperCase()} • ${evidence.source || 'tool-context'}`
    : '';
  const verification = issue.verification;
  const corroboratedBy = Array.isArray(issue.corroboratedBy) ? issue.corroboratedBy : null;
  const findingCertainty = issue.findingCertainty || (findingKind === 'violation' ? 'confirmed' : 'manual-review');

  return `
    <details class="lh-audit lh-audit--${issue.severityLabel} lh-audit--${findingKind}" ${index < 3 ? 'open' : ''}>
      <summary class="lh-audit__header">
        <span class="lh-audit__icon lh-audit__icon--${issue.severityLabel}"></span>
        <span class="lh-audit__title">${escapeHtml(issue.message)}</span>
        <span class="lh-audit__kind lh-audit__kind--${findingKind}">${findingKindLabel}</span>
        <span class="lh-audit__tool">${issue.tool}</span>
      </summary>
      <div class="lh-audit__body">
        <div class="lh-audit__detail">
          <strong>Finding certainty:</strong> ${escapeHtml(String(findingCertainty))}
          ${issue.promotionPolicyVersion ? ` • policy ${escapeHtml(issue.promotionPolicyVersion)}` : ''}
        </div>
        <div class="lh-audit__detail">
          <strong>URL:</strong> <a href="${escapeHtml(issue.url)}" target="_blank">${escapeHtml(issue.url)}</a>
        </div>
        ${issue.selector ? `
          <div class="lh-audit__detail">
            <strong>Selector:</strong> <code class="lh-code">${escapeHtml(issue.selector)}</code>
          </div>
        ` : ''}
        ${issue.html ? `
          <div class="lh-audit__detail">
            <strong>Element:</strong>
            <pre class="lh-snippet">${escapeHtml(issue.html)}</pre>
          </div>
        ` : ''}
        ${evidence?.snippet ? `
          <div class="lh-audit__detail">
            <strong>Exact Code:</strong>
            <span class="lh-evidence-badge lh-evidence-badge--${escapeHtml(evidence.confidence || 'low')}">${escapeHtml(evidenceLabel)}</span>
            <pre class="lh-snippet">${escapeHtml(evidence.snippet)}</pre>
            ${evidence.contextBefore || evidence.contextAfter ? `
              <details class="lh-evidence-context">
                <summary>Source context</summary>
                ${evidence.contextBefore ? `<pre class="lh-snippet">${escapeHtml(evidence.contextBefore)}</pre>` : ''}
                ${evidence.contextAfter ? `<pre class="lh-snippet">${escapeHtml(evidence.contextAfter)}</pre>` : ''}
              </details>
            ` : ''}
            ${evidence.locator ? `
              <div class="lh-evidence-locator">
                ${evidence.locator.xpath ? `<span><strong>XPath:</strong> <code class="lh-code">${escapeHtml(evidence.locator.xpath)}</code></span>` : ''}
                ${evidence.locator.line ? `<span><strong>Line:</strong> ${escapeHtml(String(evidence.locator.line))}</span>` : ''}
                ${evidence.locator.column ? `<span><strong>Column:</strong> ${escapeHtml(String(evidence.locator.column))}</span>` : ''}
              </div>
            ` : ''}
            ${evidence.captureError ? `
              <div class="lh-evidence-note">Evidence note: ${escapeHtml(evidence.captureError)}</div>
            ` : ''}
          </div>
        ` : ''}
        ${issue.help ? `
          <div class="lh-audit__detail">
            <strong>How to fix:</strong> ${escapeHtml(issue.help)}
          </div>
        ` : ''}
        ${issue.recommendedFix ? `
          <div class="lh-audit__detail">
            <strong>Recommended fix:</strong> ${escapeHtml(issue.recommendedFix)}
          </div>
        ` : ''}
        ${verification ? `
          <div class="lh-audit__detail">
            <strong>Contrast verification:</strong>
            <span class="lh-audit__verify lh-audit__verify--${escapeHtml(verification.status || 'inconclusive')}">${escapeHtml(String(verification.status || 'inconclusive').toUpperCase())}</span>
            ${verification.minRatio != null ? ` min ratio ${escapeHtml(String(verification.minRatio))}:1` : ''}
            ${verification.threshold != null ? ` (threshold ${escapeHtml(String(verification.threshold))}:1)` : ''}
            ${verification.sampleCount != null ? ` • samples ${escapeHtml(String(verification.sampleCount))}` : ''}
            ${verification.confidence ? ` • confidence ${escapeHtml(String(verification.confidence).toUpperCase())}` : ''}
            ${verification.reasonCode ? ` • reason ${escapeHtml(String(verification.reasonCode))}` : ''}
            ${verification.inputsHash ? ` • inputs ${escapeHtml(String(verification.inputsHash))}` : ''}
            ${verification.reason ? `<div class="lh-evidence-note">${escapeHtml(verification.reason)}</div>` : ''}
          </div>
        ` : ''}
        ${corroboratedBy && corroboratedBy.length > 1 ? `
          <div class="lh-audit__detail">
            <strong>Corroborated by:</strong> ${escapeHtml(corroboratedBy.join(', '))}
          </div>
        ` : ''}
        ${wcagTags ? `
          <div class="lh-audit__detail">
            <strong>WCAG Criteria:</strong> ${wcagTags}
          </div>
        ` : ''}
        ${issue.helpUrl ? `
          <div class="lh-audit__detail">
            <a href="${escapeHtml(issue.helpUrl)}" target="_blank" class="lh-link">Learn more ↗</a>
          </div>
        ` : ''}
      </div>
    </details>
  `;
}

/**
 * @param {any[]} results
 * @returns {string}
 */
export function generatePageRowsHtml(results) {
  return results
    .map((r, idx) => {
      const issueCount = r.unifiedIssues?.length || 0;
      const confirmedCount =
        (r.unifiedIssues || []).filter((issue) => getFindingKind(issue) === 'violation').length;
      const manualReviewCount =
        (r.unifiedIssues || []).filter((issue) => getFindingKind(issue) === 'manual-review').length;
      const hasErrors = r.errors && Object.keys(r.errors).length > 0;
      return `
      <details class="lh-page-audit" ${idx === 0 ? 'open' : ''}>
        <summary class="lh-page-header">
          <span class="lh-page-url">${escapeHtml(r.url)}</span>
          <span class="lh-page-metrics">
            ${r.lhScore !== null ? `<span class="lh-metric ${getScoreClass(r.lhScore)}">LH: ${r.lhScore}%</span>` : ''}
            <span class="lh-metric">Issues: ${issueCount}</span>
            <span class="lh-metric">Confirmed: ${confirmedCount}</span>
            <span class="lh-metric">Manual: ${manualReviewCount}</span>
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
    })
    .join('');
}

/**
 * @param {Map<string, {criteria: any, issues: any[]}>} issuesByWcag
 * @returns {string}
 */
export function generateWcagSummaryHtml(issuesByWcag) {
  return Array.from(issuesByWcag.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([id, { criteria, issues }]) => `
    <details class="lh-wcag-criterion">
      <summary class="lh-wcag-header">
        <span class="lh-tag lh-tag--${criteria.level?.toLowerCase() || 'unknown'}">${criteria.level}</span>
        <span class="lh-wcag-id">${id}</span>
        <span class="lh-wcag-name">${escapeHtml(criteria.name || '')}</span>
        <span class="lh-wcag-count">${issues.length} issue${issues.length !== 1 ? 's' : ''}</span>
      </summary>
      <div class="lh-wcag-body">
        ${issues.slice(0, 5).map((issue, i) => generateIssueCard(issue, i)).join('')}
        ${issues.length > 5 ? `<p class="lh-more">...and ${issues.length - 5} more issues</p>` : ''}
      </div>
    </details>
  `
    )
    .join('');
}
