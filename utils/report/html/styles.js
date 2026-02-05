export const REPORT_HTML_STYLES = `
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

    .lh-evidence-badge {
      display: inline-block;
      margin: 0 0 8px 8px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .lh-evidence-badge--high { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .lh-evidence-badge--medium { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .lh-evidence-badge--low { background: rgba(107, 114, 128, 0.25); color: #6b7280; }

    .lh-evidence-context {
      margin-top: 8px;
    }

    .lh-evidence-locator {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--color-text-secondary);
    }

    .lh-evidence-note {
      margin-top: 8px;
      font-size: 12px;
      color: var(--color-text-secondary);
    }

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
`;

export default REPORT_HTML_STYLES;
