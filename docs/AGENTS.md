# Repository Guidelines

## Project Structure & Module Organization
- `index.js` is the stable CLI/bin entrypoint.
- `cli/` contains parsing, help text, input flow, orchestration and summary rendering.
- `services/` contains facade modules plus extracted internals under `services/audit/` and `services/crawler/`.
- `utils/` contains facades and shared helpers; format-specific report modules live under `utils/report/`, WCAG datasets/helpers under `utils/wcag/`.
- `types/` holds shared JSDoc typedef modules.
- `scripts/check-modularity.js` enforces import boundaries and file-size guardrails.
- `reports/` and `logs/` are output/runtime artifacts; treat them as generated files, not source.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Node.js 20+ required).
- `npm start -- --url https://example.com` — run the CLI locally.
- `npm run audit -- --url https://example.com --format html` — explicit audit command (same entry point).
- `npm run lint` — run ESLint across the repo.
- `npm test` — run Node test suite.
- `npm run check:modularity` — run boundary and file-size checks.
- `npm run format` — format code with Prettier.
- `./install.sh` — install the CLI globally as `a11y-audit-pro`.

## Coding Style & Naming Conventions
- Formatting is enforced by `.editorconfig` and Prettier: 2-space indentation, LF, UTF-8, trailing newline, single quotes, semicolons, max line width 100.
- Use ES modules (`type: module`) and keep imports explicit and ordered by external then local.
- Keep filenames PascalCase-like only where already established in project scripts; current source files use `*.js` with descriptive service/utility names.
- Prefer small, focused functions in `utils/` for reusable logic.

## Testing Guidelines
- Before opening a PR, run:
  - `npm run lint`
  - `npm test`
  - `npm run check:modularity`
  - at least one real audit smoke test, e.g. `npm run audit -- --url https://example.com --limit 3 --no-interactive`
- Place tests in `test/` and keep coverage focused on public contracts and regression-prone internals.

## Module Boundary Rules
- Allowed import direction: `cli -> services -> utils`.
- `utils/` modules must not import `services/` or `cli/`.
- `services/` modules must not import `cli/`.

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
