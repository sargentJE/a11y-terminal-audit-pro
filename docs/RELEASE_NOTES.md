# Release Notes

## Unreleased

### Breaking
- Default scan tool changed from `lighthouse,axe,pa11y` to `axe`.
- To keep previous behavior, pass `--tool lighthouse,axe,pa11y` or set `"tools": ["lighthouse", "axe", "pa11y"]` in config.

### Added
- New `--tool <name[,name...]>` CLI flag (repeatable) to choose scan tools.
- New config field `tools` (array primary; comma-separated string also accepted).
- Report metadata now includes `meta.tools` for run traceability.
- CLI now emits a one-line migration warning when tool selection is implicit (defaulting to `axe`).

### Migration
- CI jobs using `--min-score` must include Lighthouse, for example:
  - `a11y-audit-pro --url https://example.com --tool lighthouse,axe --min-score 80 --no-interactive`
- To suppress the implicit-default warning in CI logs, set:
  - `A11Y_SUPPRESS_TOOL_DEFAULT_WARNING=1`
