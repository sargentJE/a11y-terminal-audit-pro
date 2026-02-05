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
    'Message',
    'Selector',
    'HTML',
    'URL',
    'WCAG Criteria',
    'WCAG Level',
    'Tool',
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
      issue.message,
      issue.selector || '',
      issue.html || '',
      issue.url,
      wcagCriteria,
      wcagLevels,
      issue.tool,
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
