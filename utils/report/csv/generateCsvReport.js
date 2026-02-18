import fs from 'fs-extra';
import { escapeCsvCell } from './csvEscape.js';

/**
 * @param {{ results: any[] }} data
 * @param {string} filepath
 * @param {{ csvLegacy?: boolean }} [options]
 */
export async function generateCsvReport(data, filepath, options = {}) {
  const { results } = data;
  const csvLegacy = options.csvLegacy === true;

  const allIssues = results.flatMap((r) => r.unifiedIssues || []);

  const baseHeaders = [
    'Severity',
    'Severity Level',
    'Finding Kind',
    'Finding Certainty',
    'Counts Toward Compliance',
    'Promotion Policy Version',
    'Message',
    'Selector',
    'HTML',
    'URL',
    'WCAG Criteria',
    'WCAG Level',
    'Tool',
    'Corroborated By',
    'Merged From',
    'Recommended Fix',
    'Verification Status',
    'Verification Confidence',
    'Verification Reason Code',
    'Verification Inputs Hash',
    'Verification Min Ratio',
    'Verification Threshold',
    'Verification Samples',
    'Help URL',
  ];

  const evidenceHeaders = [
    'Evidence Snippet',
    'Evidence Source',
    'Evidence Confidence',
    'Evidence Line',
    'Evidence Column',
    'Evidence XPath',
  ];
  const headers = csvLegacy ? baseHeaders : [...baseHeaders, ...evidenceHeaders];

  const rows = allIssues.map((issue) => {
    const wcagCriteria = (issue.wcagCriteria || []).map((c) => c.id).join('; ');
    const wcagLevels = [...new Set((issue.wcagCriteria || []).map((c) => c.level))].join('; ');

    const baseRow = [
      issue.severityLabel,
      issue.severity,
      issue.findingKind || (issue.countsTowardCompliance === false ? 'manual-review' : 'violation'),
      issue.findingCertainty || '',
      issue.countsTowardCompliance === false ? 'false' : 'true',
      issue.promotionPolicyVersion || '',
      issue.message,
      issue.selector || '',
      issue.html || '',
      issue.url,
      wcagCriteria,
      wcagLevels,
      issue.tool,
      Array.isArray(issue.corroboratedBy) ? issue.corroboratedBy.join('; ') : '',
      Array.isArray(issue.mergedFrom) ? issue.mergedFrom.join('; ') : '',
      issue.recommendedFix || '',
      issue.verification?.status || '',
      issue.verification?.confidence || '',
      issue.verification?.reasonCode || '',
      issue.verification?.inputsHash || '',
      issue.verification?.minRatio ?? '',
      issue.verification?.threshold ?? '',
      issue.verification?.sampleCount ?? '',
      issue.helpUrl || '',
    ];

    if (csvLegacy) return baseRow;

    return [
      ...baseRow,
      issue.evidence?.snippet || '',
      issue.evidence?.source || '',
      issue.evidence?.confidence || '',
      issue.evidence?.locator?.line ?? '',
      issue.evidence?.locator?.column ?? '',
      issue.evidence?.locator?.xpath || '',
    ];
  });

  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\n');

  await fs.outputFile(filepath, csv);
}

export default generateCsvReport;
