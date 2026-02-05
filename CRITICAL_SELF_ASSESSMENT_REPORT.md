# Critical Self-Assessment Report (Code Evidence Capability)

Date: February 5, 2026  
Scope: `c8d83de`, `d88b224` feature set (evidence extraction, config/CLI, report surfaces)

## Executive Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Correctness | 24/30 | Strong evidence resolution; low-confidence fallback still present on dynamic nodes |
| Reliability | 16/20 | Non-fatal error handling works; selector volatility impacts determinism |
| Security & Privacy | 17/20 | Redaction validated across outputs; regex coverage can be broadened |
| Performance | 11/15 | Controlled benchmark overhead is low; real-world variance needs monitoring |
| UX / DX | 8/10 | CLI/config/report experience is coherent and actionable |
| Compatibility | 4/5 | JSON remains additive; CSV schema expansion may affect strict consumers |
| **Total** | **80/100** | **Good production quality with targeted hardening opportunities** |

## Evidence Summary

- Baseline quality gates: `npm run lint` ✅, `npm test` ✅ (9 tests passing).
- Route/issue parity check (`myvision`, limit=5): evidence ON vs OFF preserved crawl/output scope:
  - Routes: `5` vs `5`
  - Issues: `210` vs `210`
  - Evidence coverage (ON): `210/210` issues have evidence objects.
- Evidence quality breakdown (`myvision`, ON):
  - `dom-runtime/high`: `205`
  - `tool-context/low`: `5`
  - with line numbers: `204`
  - with XPath: `205`
- Security redaction check (`reports/self-assessment-security-2026-02-05.json`):
  - JSON/CSV/SARIF/HTML all show `leaked=false`, `redacted=true`.
- Performance:
  - Controlled benchmark (`example.com`, 3 runs each): avg ON `15.61s`, avg OFF `15.27s` (delta `+0.34s`).
  - Real-world sample (`myvision`) showed higher wall-time variance across runs; treat as noisy and monitor at scale.
- Compatibility:
  - JSON change is additive: only new optional field `evidence`.
  - CSV now includes evidence columns (present regardless of ON/OFF run).
  - SARIF includes `region`; ON adds line/column metadata when available.

## Key Strengths

1. Architecture is modular (`CodeEvidenceExtractor`) and failure-tolerant.
2. Evidence integrates cleanly across JSON/HTML/CSV/SARIF.
3. Security posture improved through evidence redaction before export.
4. Configuration + CLI controls enable safe runtime tuning.

## Critical Weaknesses / Risks

### P1 - Determinism risk in issue identity
- Dynamic selectors cause unstable issue IDs between runs (example: `#rs_slidelink_89033` vs `#rs_slidelink_28354`), reducing comparability in regression tracking.

### P1 - Compatibility risk for strict CSV consumers
- Evidence columns expand CSV schema; downstream tooling expecting fixed column count may break.

### P1 - Redaction coverage can be deeper
- Current regex focuses on common quoted key/value patterns; additional secret patterns (e.g., bearer tokens in URLs, unquoted attrs) should be covered.

### P2 - Observability gap
- No first-class extraction telemetry in output summary (e.g., high/medium/low counts, unresolved count, extraction overhead).

## Prioritized Remediation Roadmap

1. **Stabilize fingerprints (P1)**  
   Add `stableFingerprint` independent of volatile selectors (use URL + WCAG IDs + normalized message + rule family).
2. **Introduce compatibility toggle (P1)**  
   Add `--csv-legacy` to omit evidence columns for strict pipelines.
3. **Harden redaction (P1)**  
   Expand sanitization rules for URL query secrets, bearer formats, and unquoted attributes.
4. **Add evidence telemetry (P2)**  
   Include extraction summary in `meta` and terminal output (coverage %, unresolved count, extraction time).
5. **Add deterministic regression tests (P2)**  
   Snapshot comparisons validating issue equivalence across ON/OFF with normalized IDs.

## Artifact References

- `reports/self-assessment-2026-02-05T14-02-41Z/summary.json`
- `reports/self-assessment-perf-2026-02-05T14-05-38Z/perf-summary.json`
- `reports/self-assessment-compat-2026-02-05T14-08-28Z/json-compat.json`
- `reports/self-assessment-security-2026-02-05.json`
