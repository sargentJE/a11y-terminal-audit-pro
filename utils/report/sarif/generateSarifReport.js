import fs from 'fs-extra';

/**
 * Generate SARIF report.
 *
 * @param {{ meta: any, results: any[] }} data
 * @param {string} filepath
 */
export async function generateSarifReport(data, filepath) {
  const { meta, results } = data;
  const allIssues = results.flatMap((r) => r.unifiedIssues || []);

  const severityToLevel = {
    critical: 'error',
    serious: 'error',
    moderate: 'warning',
    minor: 'note',
  };

  const rulesMap = new Map();
  for (const issue of allIssues) {
    const ruleId = issue.id.split('-').slice(0, 2).join('-');
    if (!rulesMap.has(ruleId)) {
      rulesMap.set(ruleId, {
        id: ruleId,
        name: issue.message.substring(0, 100),
        shortDescription: { text: issue.message.substring(0, 200) },
        fullDescription: { text: issue.help || issue.message },
        helpUri: issue.helpUrl || undefined,
        properties: {
          tags: (issue.wcagCriteria || []).map((c) => `WCAG${c.id}`),
        },
      });
    }
  }

  const sarifResults = allIssues.map((issue) => {
    const ruleId = issue.id.split('-').slice(0, 2).join('-');
    const region = {};
    const evidenceLine = issue.evidence?.locator?.line;
    const evidenceColumn = issue.evidence?.locator?.column;
    const evidenceSnippet = issue.evidence?.snippet || issue.html;

    if (typeof evidenceLine === 'number' && evidenceLine > 0) {
      region.startLine = evidenceLine;
    }
    if (typeof evidenceColumn === 'number' && evidenceColumn > 0) {
      region.startColumn = evidenceColumn;
    }
    if (evidenceSnippet) {
      region.snippet = { text: evidenceSnippet };
    }

    return {
      ruleId,
      ruleIndex: Array.from(rulesMap.keys()).indexOf(ruleId),
      level: severityToLevel[issue.severityLabel] || 'warning',
      message: { text: issue.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: issue.url },
            ...(Object.keys(region).length > 0 ? { region } : {}),
          },
          logicalLocations: issue.selector
            ? [
                {
                  name: issue.selector,
                  kind: 'element',
                },
              ]
            : undefined,
        },
      ],
      partialFingerprints: {
        primaryLocationLineHash: Buffer.from(
          `${issue.url}:${issue.selector}:${issue.message}`
        ).toString('base64').substring(0, 32),
      },
    };
  });

  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'A11Y Terminal Audit Pro',
            version: meta.version,
            informationUri: 'https://github.com/example/a11y-terminal-audit-pro',
            rules: Array.from(rulesMap.values()),
          },
        },
        results: sarifResults,
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: meta.generatedAt,
          },
        ],
      },
    ],
  };

  await fs.outputJson(filepath, sarif, { spaces: 2 });
}

export default generateSarifReport;
