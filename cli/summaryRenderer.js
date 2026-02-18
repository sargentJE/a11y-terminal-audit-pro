import cliTablePkg from 'cli-table3';
import { blue, bold, gray, green, red, yellow } from 'colorette';

// CJS ↔ ESM interop.
const Table = cliTablePkg.default || cliTablePkg;

/**
 * @param {string} level
 * @returns {string}
 */
export function formatComplianceBadge(level) {
  const badges = {
    AAA: green(bold('✓ AAA')),
    AA: blue(bold('✓ AA')),
    A: yellow(bold('✓ A')),
    'Non-Conformant': red(bold('✗ Non-Conformant')),
  };
  return badges[level] || level;
}

/**
 * Render final terminal summary and return resulting exit code.
 *
 * @param {object} params
 * @param {Array<any>} params.report
 * @param {string[]} params.selectedTools
 * @param {any} params.compliance
 * @param {any} params.evidenceSummary
 * @param {any} params.thresholdResult
 * @param {string[]} params.generatedFiles
 * @param {any} params.config
 * @returns {number}
 */
export function renderFinalSummary({
  report,
  selectedTools,
  compliance,
  evidenceSummary,
  thresholdResult,
  generatedFiles,
  config,
}) {
  const isSelected = (tool) => selectedTools.includes(tool);
  const formatToolMetric = (tool, value, errors, format) => {
    if (!isSelected(tool)) return gray('SKIP');
    if (value != null) return format(value);
    if (errors?.[tool]) return red('ERR');
    return '—';
  };

  const table = new Table({
    head: [blue('URL'), blue('LH Score'), blue('Axe'), blue('Pa11y'), blue('Issues'), blue('Time')],
    colWidths: [50, 10, 6, 8, 8, 8],
    wordWrap: true,
  });

  for (const r of report) {
    table.push([
      r.url,
      formatToolMetric('lighthouse', r.lhScore, r.errors, (v) => `${v}%`),
      formatToolMetric('axe', r.axeViolations, r.errors, (v) => String(v)),
      formatToolMetric('pa11y', r.pa11yIssues, r.errors, (v) => String(v)),
      String(r.totalIssues ?? 0),
      typeof r.durationMs === 'number' ? `${Math.round(r.durationMs / 1000)}s` : '—',
    ]);
  }

  console.log('\n' + table.toString());
  console.log(
    `\n${bold('Scanned Tools')}: ${selectedTools.join(', ')} ${gray('(SKIP means not selected)')}`
  );

  console.log('\n' + bold('WCAG Compliance Summary'));
  console.log('─'.repeat(50));
  console.log(`  Compliance Level: ${formatComplianceBadge(compliance.level)}`);
  console.log(
    `  Compliance Score: ${bold(String(compliance.confirmedScore ?? compliance.score))}/100 (confirmed)`
  );
  console.log(`  Reported Score:   ${bold(String(compliance.reportedScore ?? compliance.score))}/100 (all findings)`);
  console.log(`  ${compliance.description}`);
  console.log('');
  console.log(`  Issues by Severity:`);
  console.log(`    ${red('Critical')}: ${compliance.summary.critical}`);
  console.log(`    ${yellow('Serious')}:  ${compliance.summary.serious}`);
  console.log(`    ${blue('Moderate')}: ${compliance.summary.moderate}`);
  console.log(`    ${gray('Minor')}:    ${compliance.summary.minor}`);
  console.log(`    ${bold('Confirmed')}: ${compliance.summary.consideredTotal}`);
  console.log(`    ${gray('Manual Review')}: ${compliance.summary.manualReview}`);
  console.log(`    ${gray('Inconclusive')}: ${compliance.summary.inconclusive ?? 0}`);
  console.log(`    ${bold('Promoted')}: ${compliance.summary.promoted ?? 0}`);
  console.log(`    ${bold('Reported')}:  ${compliance.summary.reportedTotal}`);
  if (typeof compliance.summary.rawReportedTotal === 'number') {
    console.log(
      `    ${gray('Raw Reported')}: ${compliance.summary.rawReportedTotal} (${compliance.summary.collapsedDuplicates || 0} duplicates collapsed)`
    );
  }
  console.log(
    `  Scoring Policy: ${
      compliance.scoringPolicy?.includeManualChecks
        ? 'manual-review findings included'
        : 'manual-review findings excluded by default'
    } (confidence threshold: ${compliance.scoringPolicy?.confidenceThreshold || 'high'})`
  );
  console.log(`  Scope: selected tools only (${selectedTools.join(', ')})`);
  if (compliance.qualitySignals?.manualReviewDominates || compliance.qualitySignals?.lowConfidenceDominates) {
    console.log(
      `  ${yellow('Caution')}: certainty ${String(compliance.qualitySignals?.certaintyLabel || 'low').toUpperCase()}`
    );
    for (const note of compliance.qualitySignals?.notes || []) {
      console.log(`    - ${note}`);
    }
  }

  if (compliance.wcagSummary.failedA.length > 0) {
    console.log(`\n  ${red('Failed Level A Criteria:')}`);
    for (const c of compliance.wcagSummary.failedA.slice(0, 5)) {
      console.log(`    - ${c}`);
    }
    if (compliance.wcagSummary.failedA.length > 5) {
      console.log(`    ... and ${compliance.wcagSummary.failedA.length - 5} more`);
    }
  }

  if (compliance.wcagSummary.failedAA.length > 0) {
    console.log(`\n  ${yellow('Failed Level AA Criteria:')}`);
    for (const c of compliance.wcagSummary.failedAA.slice(0, 5)) {
      console.log(`    - ${c}`);
    }
    if (compliance.wcagSummary.failedAA.length > 5) {
      console.log(`    ... and ${compliance.wcagSummary.failedAA.length - 5} more`);
    }
  }

  if (evidenceSummary) {
    if (evidenceSummary.enabled) {
      console.log('\n' + bold('Code Evidence Summary'));
      console.log('─'.repeat(50));
      console.log(
        `  Coverage: ${
          evidenceSummary.totalIssues > 0
            ? Math.round(
                ((evidenceSummary.high + evidenceSummary.medium + evidenceSummary.low) /
                  evidenceSummary.totalIssues) *
                  100
              )
            : 0
        }%`
      );
      console.log(`  High confidence:   ${evidenceSummary.high}`);
      console.log(`  Medium confidence: ${evidenceSummary.medium}`);
      console.log(`  Low confidence:    ${evidenceSummary.low}`);
      console.log(`  Unresolved:        ${evidenceSummary.unresolved}`);
      console.log(`  Extraction time:   ${Math.round((evidenceSummary.extractionMs || 0) / 1000)}s`);
    } else {
      console.log('\n' + gray('Code Evidence Summary: disabled'));
    }
  }

  let exitCode = 0;
  if (thresholdResult && !thresholdResult.passed) {
    console.log('\n' + red(bold('Threshold Check: FAILED')));
    for (const failure of thresholdResult.failures) {
      console.log(`  ${red('✗')} ${failure}`);
    }
    exitCode = 1;
  } else if (thresholdResult && config.__meta?.hasUserThresholds) {
    console.log('\n' + green(bold('Threshold Check: PASSED')));
  }

  console.log('\n' + bold('Generated Reports:'));
  for (const file of generatedFiles || []) {
    console.log(green(`  ✔ ${file}`));
  }

  return exitCode;
}

export default renderFinalSummary;
