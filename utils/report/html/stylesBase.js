export const REPORT_HTML_STYLES_BASE = `
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
`;

export default REPORT_HTML_STYLES_BASE;
