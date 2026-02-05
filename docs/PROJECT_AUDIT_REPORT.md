# Project Audit Report

Date: February 5, 2026  
Scope: full source audit of CLI flow, crawling, audit engines, reporting, configuration, quality gates, and operational security.

## Findings (Prioritized)

### P0 - Security and correctness risks

1. **Protected-page audits can be inaccurate for header-based auth**
   - Evidence: `services/AuditService.js:179-181`, `services/AuditService.js:195-206`, `services/AuditService.js:287-296`, `services/AuditService.js:395-399`
   - Issue: auth headers are applied only to the Puppeteer page used for axe; Lighthouse and Pa11y run separate navigations and may not carry those headers.
   - Impact: false negatives/positives on authenticated routes.
   - Recommendation: centralize auth at browser context/proxy layer, or inject headers/cookies consistently per tool run.

2. **Crawler can bypass route filters when sitemap is large**
   - Evidence: `services/CrawlerService.js:108-124`
   - Issue: early-return sitemap path does not apply robots/pattern checks before returning URLs.
   - Impact: auditing excluded/disallowed pages.
   - Recommendation: run all sitemap candidates through `#isDisallowed` + `#matchesPatterns` before accepting.

3. **`--no-sandbox` is always enabled**
   - Evidence: `utils/BrowserManager.js:53-57`
   - Issue: sandbox is disabled even outside CI.
   - Impact: weaker isolation when scanning untrusted sites.
   - Recommendation: enable sandbox by default; gate `--no-sandbox` behind explicit CLI/config option for CI.

4. **CSV formula injection risk in exported reports**
   - Evidence: `utils/ReportGenerator.js:1149-1175`
   - Issue: user/site-controlled values are quoted but not neutralized for spreadsheet formulas (`=`, `+`, `-`, `@`).
   - Impact: potential command/data exfiltration when CSV is opened in spreadsheet tools.
   - Recommendation: prefix risky cells with `'` during CSV escaping.

### P1 - Product and UX defects

5. **Threshold status prints “PASSED” even when no thresholds are intentionally set**
   - Evidence: `index.js:622-624`, defaults in `utils/Config.js:92-98`
   - Issue: default `minScore: 0` triggers success message path.
   - Impact: misleading CI/operator signal.
   - Recommendation: compute an explicit `hasUserThresholds` flag from CLI/config source, not merged defaults.

6. **Config-file URL still triggers interactive prompts**
   - Evidence: `index.js:347-348` (interactive decision before config load), config load at `index.js:355-377`
   - Issue: if URL exists only in config, interactive mode still activates.
   - Impact: poor non-CI UX and unexpected prompts.
   - Recommendation: determine interactivity after merged config is available.

7. **`maxSerious` threshold exists but is not configurable via CLI**
   - Evidence: support in `utils/WCAGCompliance.js:259-264`, defaults in `utils/Config.js:95`, missing parse in `index.js:371-375`
   - Issue: feature parity mismatch between config and CLI.
   - Impact: inconsistent automation behavior.
   - Recommendation: add `--max-serious` argument parsing + help text.

8. **HTML report tab/filter handlers rely on implicit global `event`**
   - Evidence: `utils/ReportGenerator.js:1096`, `utils/ReportGenerator.js:1104`
   - Impact: brittle behavior across browsers/runtimes.
   - Recommendation: pass `event` explicitly in inline handlers or attach listeners programmatically.

### P2 - Quality, maintainability, and drift

9. **Lint currently fails**
   - Evidence: `npm run lint` output (unused private method, browser globals in evaluate script)
   - Files: `services/CrawlerService.js:263`, `services/CrawlerService.js:314+`
   - Impact: no clean quality gate.
   - Recommendation: remove dead private method, add browser globals comments/wrappers for `page.evaluate` blocks, make lint pass in CI.

10. **Large files increase change risk**
   - Evidence: `utils/ReportGenerator.js` (1310 LOC), `services/CrawlerService.js` (912 LOC), `index.js` (640 LOC)
   - Impact: harder review/testing, regression-prone edits.
   - Recommendation: split by responsibility (CLI parsing, crawl strategies, report templates, exporters).

11. **Documentation drift**
   - Evidence: moderate score deduction differs (`README.md:328` vs `utils/WCAGCompliance.js:203`), dark mode claim in README (`README.md:372`) not reflected in report CSS.
   - Impact: user trust and onboarding friction.
   - Recommendation: align README with runtime behavior via doc checks in CI.

12. **Dependency and ecosystem hygiene**
   - Evidence: `npm audit --omit=dev` finds moderate `jsonpath` vulnerability via `pa11y -> bfj`; `npm outdated` shows Puppeteer patch behind.
   - Impact: avoidable security/maintenance risk.
   - Recommendation: upgrade dependency chain where possible and track unresolved transitive risks.

## Strengths

- Strong modular decomposition (`services/`, `utils/`) with clear domain intent.
- Good resilience pattern: retries with exponential backoff and per-tool error isolation.
- Practical reporting breadth (JSON/HTML/CSV/SARIF) with CI-oriented exit code behavior.
- Solid crawl feature set (sitemap + robots + SPA + shadow DOM) for modern sites.
- Clear CLI help and onboarding path, including sample config generation.

## Recommendations

1. Add a **P0 hardening sprint** (auth consistency, sandbox policy, CSV sanitization, sitemap filtering).  
2. Add a **quality baseline pipeline**: lint must pass, plus at least smoke/integration tests for one public URL fixture.  
3. Refactor into smaller modules and add contract tests around normalization/compliance math.  
4. Introduce release hygiene: dependency update cadence, audit policy, and docs verification checks.

## Prioritized Summary (End)

1. **Fix security/correctness first**: auth propagation, sitemap filtering, sandbox defaults, CSV sanitization.  
2. **Fix operator trust issues next**: threshold messaging accuracy, missing `--max-serious`, config-driven non-interactive behavior.  
3. **Stabilize delivery quality**: make lint green, add automated tests, split large files.  
4. **Maintain long-term reliability**: dependency upgrades and README/runtime consistency checks.
