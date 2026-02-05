# A11Y Terminal Audit Pro

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2-orange)](https://www.w3.org/WAI/WCAG22/quickref/)

A production-grade Node.js CLI tool for comprehensive web accessibility testing with **WCAG compliance scoring**, **intelligent site crawling**, and **multi-format reports**.

```bash
# Quick start
a11y-audit-pro --url https://example.com --limit 10 --format html
```

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [CLI Options](#-cli-options)
- [Configuration File](#-configuration-file)
- [WCAG Compliance Scoring](#-wcag-compliance-scoring)
- [Report Formats](#-report-formats)
- [Authentication](#-authentication)
- [CI/CD Integration](#-cicd-integration)
- [Architecture](#-architecture)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Core Capabilities

- 🔍 **Intelligent Site Crawling**
  - Automatic sitemap.xml parsing for comprehensive page discovery
  - SPA-aware with `history.pushState` detection
  - Respects `robots.txt` rules
  - Shadow DOM link extraction
  - Configurable depth limits and URL patterns

- 🛠️ **Triple-Engine Audits**
  - **Lighthouse** — Google's comprehensive accessibility audits
  - **axe-core** — Deque's industry-standard testing engine
  - **Pa11y** — HTMLCS-based WCAG validation
  - Results are deduplicated and unified across all engines

- 📊 **WCAG Compliance Scoring**
  - Calculate A/AA/AAA conformance levels
  - Map issues to specific WCAG 2.2 success criteria
  - Generate compliance scores (0-100)
  - Track conformance against target standards

- 📝 **Professional Reports**
  - **HTML** — Lighthouse-style interactive reports with gauges and filtering
  - **JSON** — Structured data for dashboards and analysis
  - **CSV** — Spreadsheet-compatible issue lists
  - **SARIF** — GitHub Code Scanning / VS Code integration

### Enterprise Features

- 🔐 **Authentication Support** — Cookies, headers, or custom Puppeteer login scripts
- ⚡ **Parallel Execution** — Configurable concurrency for faster audits
- 🎯 **CI/CD Integration** — Threshold-based exit codes for automated pipelines
- 📁 **Config Files** — `.a11yrc.json`, `a11y.config.js`, or `a11y.config.mjs` for reproducible audits
- 🔄 **Retry Logic** — Exponential backoff for transient failures

---

## 🚀 Quick Start

```bash
# Audit a single site with HTML report
a11y-audit-pro --url https://example.com --format html

# Crawl 20 pages with parallel execution
a11y-audit-pro --url https://example.com --limit 20 --concurrency 3

# CI mode with thresholds (exits with code 1 if thresholds exceeded)
a11y-audit-pro --url https://example.com --max-critical 0 --min-score 80 --no-interactive

# Generate all report formats
a11y-audit-pro --url https://example.com --format json,html,csv,sarif
```

---

## 📦 Installation

### Prerequisites

- **Node.js 20+** (required by Pa11y v9)
- **Google Chrome** installed locally

### Option 1: Global Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-username/a11y-terminal-audit-pro.git
cd a11y-terminal-audit-pro

# Run the install script
./install.sh
```

This installs `a11y-audit-pro` as a global command you can run from anywhere.

### Option 2: Local Installation

```bash
# Clone and install dependencies
git clone https://github.com/your-username/a11y-terminal-audit-pro.git
cd a11y-terminal-audit-pro
npm install

# Run directly
node index.js --url https://example.com
```

### Option 3: npm link (Development)

```bash
npm install
npm link

# Now available globally
a11y-audit-pro --help
```

### Chrome Path (if not auto-detected)

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### Uninstall

```bash
npm unlink -g a11y-terminal-audit-pro
```

---

## 🏗️ Architecture

This project is modular and extensible:

```
a11y-terminal-audit-pro/
├── index.js                    # CLI entry point & orchestration
├── install.sh                  # Global installation script
├── package.json                # Dependencies & npm config
├── .a11yrc.json               # Optional config file (generated with --init)
│
├── services/
│   ├── AuditService.js        # Multi-tool audit engine with retry logic
│   └── CrawlerService.js      # Puppeteer crawler with sitemap/SPA support
│
├── utils/
│   ├── BrowserManager.js      # Chrome lifecycle management
│   ├── Config.js              # Config file loader with CLI merge
│   ├── Logger.js              # Structured logging with levels
│   ├── Output.js              # File path utilities
│   ├── ReportGenerator.js     # Multi-format report generation
│   ├── SeverityMapper.js      # Unified severity + WCAG criteria database
│   ├── Validation.js          # Input validation helpers
│   └── WCAGCompliance.js      # A/AA/AAA compliance calculator
│
└── reports/                    # Generated reports (gitignored)
```

---

## ⚙️ CLI Options

### Basic Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url <url>` | Target URL (required unless interactive) | — |
| `--limit <n>` | Max pages to crawl | `5` |
| `--timeout <ms>` | Per-tool timeout | `60000` |
| `--standard <name>` | WCAG standard (see below) | `WCAG2AA` |
| `--details` | Include full tool outputs in report | `false` |
| `--outDir <dir>` | Output directory | `./reports` |
| `--no-sandbox` | Disable Chrome sandbox (CI-only) | `false` |
| `--verbose` | Debug logging | `false` |
| `--no-interactive` | Do not prompt; error if inputs missing | `false` |
| `--help` | Show help | — |

**Supported standards**: `WCAG2A`, `WCAG2AA`, `WCAG2AAA`, `WCAG21A`, `WCAG21AA`, `WCAG21AAA`, `WCAG22A`, `WCAG22AA`, `WCAG22AAA`

### Report Options

| Option | Description | Default |
|--------|-------------|---------|
| `--format <formats>` | Output formats (comma-separated) | `json` |

**Supported formats**:
- `json` — Structured JSON with full issue details
- `html` — Interactive HTML with filtering and compliance badge
- `csv` — Spreadsheet-compatible issue list
- `sarif` — GitHub/VS Code compatible format

### Performance Options

| Option | Description | Default |
|--------|-------------|---------|
| `--concurrency <n>` | Parallel audit workers | `1` |

⚠️ Higher concurrency = faster but more CPU/memory usage

### Crawler Options

| Option | Description | Default |
|--------|-------------|---------|
| `--sitemap` | Use sitemap.xml for URL discovery | `true` |
| `--spa` | Enable SPA route detection | `true` |

### Authentication Options

| Option | Description |
|--------|-------------|
| `--cookies <json>` | Cookies as JSON array |
| `--headers <json>` | Headers as JSON object |
| `--login-script <path>` | Path to login script module |

**Cookie example**:
```bash
--cookies '[{"name":"session","value":"abc123","domain":"example.com"}]'
```

**Header example**:
```bash
--headers '{"Authorization":"Bearer token123"}'
```

### CI/CD Threshold Options

Exit code `1` if any threshold is exceeded:

| Option | Description |
|--------|-------------|
| `--max-violations <n>` | Fail if total violations exceed threshold |
| `--max-critical <n>` | Fail if critical issues exceed threshold |
| `--max-serious <n>` | Fail if serious issues exceed threshold |
| `--min-score <n>` | Fail if Lighthouse score below threshold (0-100) |
| `--min-compliance <lvl>` | Fail if compliance below A/AA/AAA |

### Code Evidence Options

| Option | Description | Default |
|--------|-------------|---------|
| `--code-evidence` | Enable exact code evidence extraction | `true` |
| `--no-code-evidence` | Disable code evidence extraction | `false` |
| `--evidence-context-lines <n>` | Source context lines around snippet | `2` |
| `--evidence-max-chars <n>` | Max chars per snippet/context field | `2000` |
| `--evidence-max-ops <n>` | Max selector lookups per page | `500` |
| `--evidence-timeout <ms>` | Timeout per evidence lookup operation | `1500` |

---

## Configuration File

Generate a sample config file:

```bash
node index.js --init
```

This creates `.a11yrc.json`:

```json
{
  "url": "https://example.com",
  "limit": 10,
  "timeout": 60000,
  "standard": "WCAG2AA",
  "details": true,
  "outDir": "./reports",
  "formats": ["json", "html"],
  "concurrency": 3,
  "deduplicateIssues": true,
  "evidence": {
    "enabled": true,
    "contextLines": 2,
    "maxChars": 2000,
    "maxOpsPerPage": 500,
    "timeoutMs": 1500
  },
  "crawler": {
    "useSitemap": true,
    "respectRobotsTxt": true,
    "detectSpaRoutes": true,
    "pierceShadowDom": true,
    "includePatterns": [],
    "excludePatterns": ["/admin/*", "/api/*"]
  },
  "thresholds": {
    "maxViolations": 50,
    "maxCritical": 0,
    "maxSerious": 5,
    "minScore": 80,
    "minCompliance": "AA"
  },
  "auth": {
    "type": "cookies",
    "cookies": [
      {
        "name": "session",
        "value": "your-session-token",
        "domain": "example.com"
      }
    ]
  }
}
```

**Priority order** (highest to lowest):
1. CLI arguments
2. Config file
3. Default values

---

## WCAG Compliance Scoring

The tool calculates an overall WCAG compliance level based on issues found:

| Level | Requirements |
|-------|--------------|
| **AAA** | No Level A, AA, or AAA failures |
| **AA** | No Level A or AA failures |
| **A** | No Level A failures |
| **Non-Conformant** | Has Level A failures |

Each issue is mapped to specific WCAG success criteria (e.g., 1.1.1 Non-text Content, 4.1.2 Name, Role, Value).

### Compliance Score Calculation

The compliance score (0-100) is calculated as:
- Start at 100
- Deduct 15 points per critical issue
- Deduct 8 points per serious issue
- Deduct 3 points per moderate issue
- Deduct 1 point per minor issue

---

## Report Formats

### JSON Report

Structured report with full issue details, compliance scoring, and metadata.

```json
{
  "meta": {
    "tool": "a11y-terminal-audit-pro",
    "version": "2.0.0",
    "generatedAt": "2024-01-15T10:30:00Z",
    "baseUrl": "https://example.com",
    "standard": "WCAG2AA"
  },
  "compliance": {
    "level": "AA",
    "score": 85,
    "description": "Site meets WCAG 2.2 Level AA conformance",
    "summary": {
      "total": 12,
      "critical": 0,
      "serious": 2,
      "moderate": 7,
      "minor": 3
    }
  },
  "results": [...]
}
```

### HTML Report

Lighthouse-style interactive HTML report with:
- 📊 Circular gauge visualizations for scores and compliance
- 🔍 Filterable and expandable issue details
- 📈 Severity breakdown by category
- 🔗 Direct links to WCAG success criteria
- 🖨️ Print-friendly styling
- 📱 Responsive layout for desktop and mobile review

### CSV Report

Spreadsheet-compatible format for issue tracking:

```csv
URL,Tool,Severity,Message,WCAG Criteria,Selector,Help URL
https://example.com,axe,2,Images must have alternate text,1.1.1: Non-text Content,img.hero,...
```

### SARIF Report

[SARIF](https://sarifweb.azurewebsites.net/) (Static Analysis Results Interchange Format) for integration with:
- **GitHub Code Scanning** — Displays issues directly in pull requests
- **VS Code SARIF Viewer** — Navigate to issues in your editor
- **Azure DevOps** — Pipeline integration

---

## 🔐 Authentication

### Cookies

```bash
a11y-audit-pro --url https://example.com \
  --cookies '[{"name":"session","value":"abc123","domain":"example.com"}]'
```

### Headers

```bash
a11y-audit-pro --url https://example.com \
  --headers '{"Authorization":"Bearer token123"}'
```

### Custom Login Script

For sites requiring complex authentication, create a login script:

```javascript
// login.js
export default async function login(page, credentials) {
  await page.goto('https://example.com/login');
  await page.type('#username', credentials.username);
  await page.type('#password', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
}
```

Use it:

```bash
a11y-audit-pro --url https://example.com --login-script ./login.js
```

Or in config file:

```json
{
  "auth": {
    "type": "login-script",
    "loginScript": "./login.js",
    "loginCredentials": {
      "username": "testuser",
      "password": "testpass"
    }
  }
}
```

---

## 🚀 CI/CD Integration

### GitHub Actions

```yaml
name: Accessibility Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run Accessibility Audit
        run: |
          npx a11y-audit-pro \
            --url ${{ env.DEPLOY_URL }} \
            --format json,html,sarif \
            --max-critical 0 \
            --min-score 80 \
            --no-interactive

      - name: Upload SARIF to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: reports/*.sarif

      - name: Upload HTML Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: accessibility-report
          path: reports/*.html
```

### GitLab CI

```yaml
accessibility-audit:
  image: node:20
  script:
    - npm ci
    - npx a11y-audit-pro --url $DEPLOY_URL --format json,html --max-critical 0 --no-interactive
  artifacts:
    paths:
      - reports/
    when: always
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All thresholds passed |
| `1` | One or more thresholds exceeded |

---

## 🔧 Troubleshooting

### "Chrome not found"

Set `CHROME_PATH` to your Chrome binary:

```bash
# macOS
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux
export CHROME_PATH="/usr/bin/google-chrome"

# Windows (PowerShell)
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### Headless Chrome fails in Linux/CI

Install Chrome dependencies and enable `--no-sandbox` only when your CI environment requires it.

```bash
# Ubuntu/Debian
apt-get install -y chromium-browser
```

### Lighthouse hangs on SPAs

Try increasing `--timeout` or enabling SPA route detection:

```bash
a11y-audit-pro --url https://spa-site.com --spa --timeout 90000
```

### Too many duplicate issues

Issue deduplication is enabled by default. Disable with config:

```json
{
  "deduplicateIssues": false
}
```

### Sitemap not being parsed

Ensure your sitemap is at a standard location (`/sitemap.xml`, `/sitemap_index.xml`) or listed in `robots.txt`. The tool uses native `fetch()` to retrieve sitemaps.

### Memory issues with large sites

Reduce concurrency or limit:

```bash
a11y-audit-pro --url https://large-site.com --limit 50 --concurrency 1
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Setup

```bash
git clone https://github.com/your-username/a11y-terminal-audit-pro.git
cd a11y-terminal-audit-pro
npm install

# Run linting
npm run lint

# Run tests
npm test

# Format code
npm run format

# Test locally
node index.js --url https://example.com --limit 1 --no-interactive
```

### Code Style

- ES Modules (ESM)
- JSDoc comments for all public APIs
- ESLint + Prettier for formatting

---

## 📄 License

MIT © 2024-2026

See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

This tool builds on the excellent work of:

- [Lighthouse](https://github.com/GoogleChrome/lighthouse) — Google's web auditing tool
- [axe-core](https://github.com/dequelabs/axe-core) — Deque's accessibility testing engine
- [Pa11y](https://github.com/pa11y/pa11y) — Automated accessibility testing
- [Puppeteer](https://github.com/puppeteer/puppeteer) — Headless Chrome automation

---

<p align="center">
  <strong>Made with ❤️ for web accessibility</strong><br>
  <sub>Helping make the web more inclusive, one audit at a time.</sub>
</p>
