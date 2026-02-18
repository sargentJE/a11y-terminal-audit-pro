# A11Y Terminal Audit Pro - User Guide (Canonical)

Version: 2.0.0

This document is the single source of truth for user-facing documentation.
All other guides and manuals should link here.

## Overview

A11Y Terminal Audit Pro is a production-grade CLI for accessibility auditing.
It crawls a site and runs three audit engines (Lighthouse, axe-core, Pa11y),
then unifies findings into WCAG criteria with compliance scoring.
Reports are exported in JSON/HTML/CSV/SARIF for engineers, QA, and CI/CD.

Key capabilities:
- Intelligent crawling (sitemap + SPA route detection + shadow DOM link extraction)
- Triple-engine audits (Lighthouse + axe-core + Pa11y)
- Default tool selection runs `axe` unless `--tool` or config `tools` is provided
- WCAG compliance scoring and level calculation
- Multi-format reporting (JSON, HTML, CSV, SARIF)
- CI/CD threshold gating with exit codes

---

## System Requirements

- Node.js 20+
- Google Chrome installed locally
- Internet access for crawling and audits

Optional:
- CHROME_PATH environment variable if Chrome is not auto-detected.

---

## Installation

### Option A - Install and run locally
```bash
git clone https://github.com/your-username/a11y-terminal-audit-pro.git
cd a11y-terminal-audit-pro
npm install
node index.js --url https://example.com
```

### Option B - Install globally (recommended for regular use)
```bash
./install.sh
```
This installs the CLI as `a11y-audit-pro`.

### Chrome path (if needed)
```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

---

## Quick Start

### Audit a single page
```bash
a11y-audit-pro --url https://example.com
```

### Audit multiple pages with crawl
```bash
a11y-audit-pro --url https://example.com --limit 10
```

### Generate multiple report formats
```bash
a11y-audit-pro --url https://example.com --format json,html,csv,sarif
```

### Run in CI (fails on thresholds)
```bash
a11y-audit-pro --url https://example.com \
  --tool lighthouse,axe \
  --max-critical 0 \
  --min-score 80 \
  --no-interactive
```

---

## CLI Options

### Basic
- `--url <url>`: Target URL (required unless interactive)
- `--tool <name[,name...]>`: Scan tools (`lighthouse`, `axe`, `pa11y`), repeatable, default `axe`
- `--limit <n>`: Max pages to crawl (default: 5)
- `--timeout <ms>`: Timeout per tool (default: 60000)
- `--standard <name>`: WCAG standard (default: WCAG2AA)
- `--details`: Include full tool outputs in report
- `--outDir <dir>`: Output directory (default: ./reports)
- `--no-sandbox`: Disable Chrome sandbox (CI-only)
- `--verbose`: Debug logging
- `--no-interactive`: Fail if required inputs are missing
- `--help`: Help text

### Report options
- `--format <formats>`: Comma-separated output formats (`json,html,csv,sarif`)
- `--csv-legacy`: CSV without evidence columns

### Performance
- `--concurrency <n>`: Parallel audit workers (default: 1)

### Crawling
- `--sitemap`: Use sitemap.xml for discovery (default: true)
- `--spa`: Enable SPA route detection (default: true)

### Authentication
- `--cookies <json>`: Cookies JSON array
- `--headers <json>`: Headers JSON object
- `--login-script <path>`: Custom login script module

### CI/CD thresholds
- `--max-violations <n>`
- `--max-critical <n>`
- `--max-serious <n>`
- `--min-score <n>`
  - Requires Lighthouse in tool selection
- `--min-compliance <A|AA|AAA>`

### Code evidence controls
- `--code-evidence` (default on)
- `--no-code-evidence`
- `--evidence-context-lines <n>`
- `--evidence-max-chars <n>`
- `--evidence-max-ops <n>`
- `--evidence-timeout <ms>`

---

## Configuration File

Generate a sample config file:
```bash
node index.js --init
```

This creates `.a11yrc.json`. Example:
```json
{
  "url": "https://example.com",
  "limit": 10,
  "timeout": 60000,
  "standard": "WCAG2AA",
  "tools": ["axe", "pa11y"],
  "details": true,
  "outDir": "./reports",
  "formats": ["json", "html"],
  "concurrency": 3,
  "report": { "csvLegacy": false },
  "evidence": { "enabled": true, "contextLines": 2 },
  "crawler": { "useSitemap": true, "detectSpaRoutes": true },
  "thresholds": { "maxCritical": 0, "minScore": 80 },
  "auth": {
    "type": "cookies",
    "cookies": [{ "name": "session", "value": "abc", "domain": "example.com" }]
  }
}
```

Precedence: CLI args > config file > defaults.

---

## Authentication

### Cookies
```bash
a11y-audit-pro --url https://example.com \
  --cookies '[{"name":"session","value":"abc","domain":"example.com"}]'
```

### Headers
```bash
a11y-audit-pro --url https://example.com \
  --headers '{"Authorization":"Bearer token123"}'
```

### Login script
Create `login.js`:
```javascript
export default async function login(page, credentials) {
  await page.goto('https://example.com/login');
  await page.type('#username', credentials.username);
  await page.type('#password', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
}
```

Run:
```bash
a11y-audit-pro --url https://example.com --login-script ./login.js
```

---

## Reports

### JSON
Structured output for dashboards and analysis. Includes unified issues, WCAG mapping, evidence, and meta.

### HTML
Interactive report with filters, gauges, and issue detail panels.

### CSV
Spreadsheet-friendly list of issues. `--csv-legacy` omits evidence columns.

### SARIF
Static Analysis Results Interchange Format for GitHub Code Scanning / VS Code SARIF.

---

## WCAG Compliance Scoring

The tool computes a compliance level (A/AA/AAA/Non-Conformant) and a numeric score (0-100),
based on severity and WCAG level deductions.

Example output:
```
Compliance Level: AA
Compliance Score: 85/100
```

---

## CI/CD Integration

Example GitHub Actions:
```yaml
- name: Run Accessibility Audit
  run: |
    npx a11y-audit-pro \
      --url ${{ env.DEPLOY_URL }} \
      --tool lighthouse,axe,pa11y \
      --format json,html,sarif \
      --max-critical 0 \
      --min-score 80 \
      --no-interactive
```

Exit codes:
- `0`: all thresholds passed
- `1`: one or more thresholds exceeded

---

## Migration Notes

- Default behavior changed to `axe` only.
- To match legacy all-engine runs, pass:
  - `--tool lighthouse,axe,pa11y`
- If `--min-score` is set, include Lighthouse in `--tool`.
- CLI shows a one-line migration warning when tool selection is implicit.
- For CI log hygiene, suppress this warning with:
  - `A11Y_SUPPRESS_TOOL_DEFAULT_WARNING=1`

---

## Accuracy Audit Harness

The project ships a comprehensive audit harness for accuracy and determinism checks.

Run the full suite (public + local fixtures):
```bash
npm run audit:accuracy
```

Run local-only (CI/PR-friendly):
```bash
node scripts/accuracy/run-accuracy-audit.js --scope local
```

Run public-only (nightly):
```bash
node scripts/accuracy/run-accuracy-audit.js --scope public
```

The harness writes summaries to:
```
reports/accuracy/<timestamp>/
```

Fixtures:
- `http://localhost:4173/good` - fully compliant minimal HTML
- `http://localhost:4173/bad` - missing alt text + low contrast + missing labels
- `http://localhost:4173/spa` - SPA pushState route detection
- `http://localhost:4173/auth` - requires auth header or cookie

Notes:
- HTML auto-open is suppressed during the harness via `A11Y_SKIP_OPEN_HTML=1`.
- In constrained CI environments, set `A11Y_NO_SANDBOX=1` to pass `--no-sandbox` to Chrome.
- If a public benchmark is unreachable, the run is recorded with tolerated error messaging.
- The harness exits non-zero if any gate fails.

---

## Troubleshooting

### Chrome not found
```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### Headless Chrome fails in CI
Use `--no-sandbox` only when required by your CI environment.

### Too many duplicate issues
Disable deduplication in config:
```json
{ "deduplicateIssues": false }
```

### Sitemap not parsed
Ensure `sitemap.xml` exists or is listed in `robots.txt`.

---

## Best Practices

- Start with a low page limit (e.g., 5) and increase as needed.
- Use concurrency sparingly; higher values increase CPU/memory use.
- Store outputs in a dedicated report folder per run.
- Use `--no-interactive` in CI to avoid prompts.

---

## Support

If you need advanced guidance or custom workflow support, open an issue or contact your internal tooling owner.
