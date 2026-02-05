# Repository Guidelines

## Project Structure & Module Organization
- `index.js` is the CLI entry point and orchestration layer.
- `services/` contains core runtime modules:
  - `AuditService.js` runs Lighthouse, axe-core, and Pa11y audits.
  - `CrawlerService.js` discovers URLs (sitemap, SPA routes, crawl limits).
- `utils/` holds shared helpers (`Config.js`, `ReportGenerator.js`, `BrowserManager.js`, WCAG mapping/scoring utilities, logging, validation).
- `reports/` and `logs/` are output/runtime artifacts; treat them as generated files, not source.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node.js 20+ required).
- `npm start -- --url https://example.com` — run the CLI locally.
- `npm run audit -- --url https://example.com --format html` — explicit audit command (same entry point).
- `npm run lint` — run ESLint across the repo.
- `npm run format` — format code with Prettier.
- `./install.sh` — install the CLI globally as `a11y-audit-pro`.

## Coding Style & Naming Conventions
- Formatting is enforced by `.editorconfig` and Prettier: 2-space indentation, LF, UTF-8, trailing newline, single quotes, semicolons, max line width 100.
- Use ES modules (`type: module`) and keep imports explicit and ordered by external then local.
- Keep filenames PascalCase-like only where already established in project scripts; current source files use `*.js` with descriptive service/utility names.
- Prefer small, focused functions in `utils/` for reusable logic.

## Testing Guidelines
- There is currently no automated test suite or `npm test` script in this repository.
- Before opening a PR, run:
  - `npm run lint`
  - at least one real audit smoke test, e.g. `npm run audit -- --url https://example.com --limit 3 --no-interactive`
- If you add tests, place them near the related module (for example, `services/__tests__/AuditService.test.js`) and add a matching npm script.

## Commit & Pull Request Guidelines
- Git history is minimal; existing commit style is short, plain-language summaries.
- Use clear, imperative commit messages (e.g., `Add WCAG mapping for new axe rules`).
- PRs should include:
  - purpose and user impact,
  - key implementation notes,
  - sample CLI command(s) used to verify behavior,
  - screenshots or report snippets when changing output format/UI.

## Security & Configuration Notes
- Do not commit secrets in auth headers/cookies or custom login scripts.
- Treat generated reports as potentially sensitive; sanitize before sharing.
- Use `CHROME_PATH` when Chrome is not auto-detected in local/CI environments.
