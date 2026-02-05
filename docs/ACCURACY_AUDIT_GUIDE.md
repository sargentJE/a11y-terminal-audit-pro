# Accuracy Audit Guide

This guide describes the comprehensive accuracy audit harness for A11Y Terminal Audit Pro.

## What it validates
- CLI behavior and config precedence
- Audit engine correctness (Lighthouse, axe, Pa11y)
- WCAG mapping/compliance scoring
- Report fidelity (JSON/HTML/CSV/SARIF)
- Robustness (timeouts, errors, SPA detection)
- Determinism (repeatable results)

## Fixtures
Local fixture server runs at `http://localhost:4173`:
- `/good` — fully compliant minimal HTML
- `/bad` — missing alt text + low contrast + missing labels
- `/spa` — SPA pushState route detection
- `/auth` — requires auth header or cookie

## Running the audit

### Full suite (public + local)
```bash
npm run audit:accuracy
```

### Local-only (PR-safe)
```bash
node scripts/accuracy/run-accuracy-audit.js --scope local
```

### Public-only (nightly)
```bash
node scripts/accuracy/run-accuracy-audit.js --scope public
```

## Outputs
- `reports/accuracy/<timestamp>/summary.json`
- `reports/accuracy/<timestamp>/summary.md`

## Notes
- HTML auto-open is suppressed during the harness via `A11Y_SKIP_OPEN_HTML=1`.
- In constrained CI environments, set `A11Y_NO_SANDBOX=1` to pass `--no-sandbox` to Chrome.
- If a public benchmark is unreachable, the run is marked with tolerated error messaging but still recorded.
- The harness exits non‑zero if any gate fails.
