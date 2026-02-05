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
 * @param {any} params.compliance
 * @param {any} params.evidenceSummary
 * @param {any} params.thresholdResult
 * @param {string[]} params.generatedFiles
 * @param {any} params.config
 * @returns {number}
 */
export function renderFinalSummary({
  report,
  compliance,
  evidenceSummary,
  thresholdResult,
  generatedFiles,
  config,
}) {
  const table = new Table({
    head: [blue('URL'), blue('LH Score'), blue('Axe'), blue('Pa11y'), blue('Issues'), blue('Time')],
    colWidths: [50, 10, 6, 8, 8, 8],
    wordWrap: true,
  });

  for (const r of report) {
    table.push([
      r.url,
      r.lhScore != null ? `${r.lhScore}%` : '—',
      r.axeViolations != null ? String(r.axeViolations) : '—',
      r.pa11yIssues != null ? String(r.pa11yIssues) : '—',
      String(r.totalIssues ?? 0),
      typeof r.durationMs === 'number' ? `${Math.round(r.durationMs / 1000)}s` : '—',
    ]);
  }

  console.log('\n' + table.toString());

  console.log('\n' + bold('WCAG Compliance Summary'));
  console.log('─'.repeat(50));
  console.log(`  Compliance Level: ${formatComplianceBadge(compliance.level)}`);
  console.log(`  Compliance Score: ${bold(String(compliance.score))}/100`);
  console.log(`  ${compliance.description}`);
  console.log('');
  console.log(`  Issues by Severity:`);
  console.log(`    ${red('Critical')}: ${compliance.summary.critical}`);
  console.log(`    ${yellow('Serious')}:  ${compliance.summary.serious}`);
  console.log(`    ${blue('Moderate')}: ${compliance.summary.moderate}`);
  console.log(`    ${gray('Minor')}:    ${compliance.summary.minor}`);
  console.log(`    ${bold('Total')}:    ${compliance.summary.total}`);

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
