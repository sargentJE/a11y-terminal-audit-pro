import { bold, gray } from 'colorette';

/**
 * Build CLI help text.
 *
 * @returns {string}
 */
export function getHelpText() {
  return `
${bold('A11Y TERMINAL AUDIT PRO')} ${gray('v2.0.0')}
Deep-crawl a site and run Lighthouse + axe-core + Pa11y accessibility audits.

${bold('Usage')}
  a11y-audit-pro --url https://example.com --limit 10
  node index.js --url https://example.com --limit 10

${bold('Basic Options')}
  --url <url>             Target URL (required unless interactive)
  --tool <name[,name...]> Scan tools (repeatable): lighthouse, axe, pa11y
                          Default: axe
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
                          Requires lighthouse in --tool selection
  --min-compliance <lvl>  Fail if compliance level below A/AA/AAA
  --include-manual-checks Include manual-review findings in compliance scoring

${bold('Verification Options')}
  --verification-v2       Enable text-aware contrast verification V2
  --verification-deterministic  Force deterministic verifier sampling (CI-friendly)
  --verification-confidence-threshold <level>  Promotion cutoff: low|medium|high (default: high)
  --verification-grid-size <n>  Sampling grid density (default: 24)

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

  ${gray('# Restore legacy all-tool behavior')}
  a11y-audit-pro --url https://example.com --tool lighthouse,axe,pa11y

  ${gray('# Generate HTML and SARIF reports')}
  a11y-audit-pro --url https://example.com --format json,html,sarif

  ${gray('# CI mode with thresholds')}
  a11y-audit-pro --url https://example.com --tool lighthouse,axe --max-critical 0 --min-score 80

  ${gray('# With authentication')}
  a11y-audit-pro --url https://myapp.com --cookies '[{"name":"token","value":"xyz"}]'

  ${gray('# Use sitemap and parallel execution')}
  a11y-audit-pro --url https://example.com --sitemap --concurrency 3
`;
}

export function printHelp() {
  console.log(getHelpText());
}

export default printHelp;
