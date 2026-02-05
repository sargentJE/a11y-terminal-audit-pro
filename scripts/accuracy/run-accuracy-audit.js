#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const indexPath = path.join(repoRoot, 'index.js');
const benchmarksPath = path.join(repoRoot, 'scripts/fixtures/benchmarks.json');

const DEFAULT_FORMATS = 'json,html,csv,sarif';
const DEFAULT_SCOPE = 'all';

const args = process.argv.slice(2);
const scopeIdx = args.indexOf('--scope');
const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : DEFAULT_SCOPE;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(repoRoot, 'reports/accuracy', timestamp);

const toleratedErrorPatterns = [
  /net::/i,
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /timeout/i,
  /Failed to fetch/i,
];

const complianceOrder = {
  'Non-Conformant': 0,
  A: 1,
  AA: 2,
  AAA: 3,
};

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

function isToleratedError(message) {
  return toleratedErrorPatterns.some((pattern) => pattern.test(message));
}

function parseGeneratedFiles(output) {
  const matches = output.match(/✔\s+([^\n]+)/g) || [];
  return matches
    .map((line) => line.replace(/✔\s+/, '').trim())
    .filter(Boolean)
    .map((file) => (path.isAbsolute(file) ? file : path.join(repoRoot, file)));
}

async function loadJsonReport(reportPath) {
  const content = await fs.readFile(reportPath, 'utf8');
  return JSON.parse(content);
}

function coveragePercent(summary) {
  if (!summary) return 0;
  if (summary.totalIssues === 0) return 100;
  const covered = summary.high + summary.medium + summary.low;
  return Math.round((covered / summary.totalIssues) * 100);
}

function collectIssues(report) {
  return report.results.flatMap((row) => row.unifiedIssues || []);
}

function extractToolErrors(report) {
  const errors = [];
  for (const row of report.results) {
    const entries = Object.entries(row.errors || {});
    for (const [, value] of entries) {
      if (!value?.message) continue;
      errors.push(value.message);
    }
  }
  return errors;
}

function validateGlobal(report, artifacts, { allowErrors }) {
  const issues = [];
  if (!report.meta?.tool) issues.push('Missing meta.tool');
  if (!report.meta?.version) issues.push('Missing meta.version');
  if (!report.meta?.standard) issues.push('Missing meta.standard');
  if (!Array.isArray(report.results)) issues.push('Missing results array');

  const allIssues = collectIssues(report);
  for (const issue of allIssues) {
    if (!issue.stableFingerprint) {
      issues.push('Issue missing stableFingerprint');
      break;
    }
    if (!issue.severityLabel) {
      issues.push('Issue missing severityLabel');
      break;
    }
  }

  const errors = extractToolErrors(report);
  if (errors.length > 0 && !allowErrors) {
    const nonTolerated = errors.filter((msg) => !isToleratedError(msg));
    if (nonTolerated.length > 0) {
      issues.push(`Tool errors detected: ${nonTolerated.join('; ')}`);
    }
  }

  const htmlPath = artifacts.html;
  if (htmlPath) {
    const html = artifacts.htmlContent;
    if (!html.includes('All Issues')) issues.push('HTML missing All Issues tab');
    if (!html.includes('By Page')) issues.push('HTML missing By Page tab');
    if (!html.includes('By WCAG Criteria')) issues.push('HTML missing By WCAG Criteria tab');
    if (!html.includes('gauge')) issues.push('HTML missing gauge elements');
  } else {
    issues.push('HTML report missing');
  }

  if (artifacts.csvHeader) {
    const required = [
      'Severity',
      'Message',
      'URL',
      'Evidence Snippet',
      'Evidence Source',
    ];
    for (const column of required) {
      if (!artifacts.csvHeader.includes(column)) {
        issues.push(`CSV header missing column: ${column}`);
      }
    }
  } else {
    issues.push('CSV report missing');
  }

  if (artifacts.sarif) {
    const sarif = artifacts.sarifContent;
    if (!sarif.runs?.[0]?.tool?.driver?.name) {
      issues.push('SARIF missing tool driver name');
    }
    if (!Array.isArray(sarif.runs?.[0]?.results)) {
      issues.push('SARIF missing results array');
    }
  } else {
    issues.push('SARIF report missing');
  }

  return issues;
}

function validateLocalFixture(report, fixtureType, context) {
  const issues = [];
  const result = report.results[0];
  const allIssues = collectIssues(report);

  if (fixtureType === 'good') {
    if (result.totalIssues > 1) issues.push('Good fixture has too many issues');
    const hasSevere = allIssues.some((i) => ['critical', 'serious'].includes(i.severityLabel));
    if (hasSevere) issues.push('Good fixture contains critical/serious issues');
  }

  if (fixtureType === 'bad') {
    if (result.totalIssues < 3) issues.push('Bad fixture has too few issues');
    const criteria = new Set(
      allIssues.flatMap((i) => (i.wcagCriteria || []).map((c) => c.id))
    );
    if (!criteria.has('1.1.1')) issues.push('Bad fixture missing WCAG 1.1.1');
    if (!criteria.has('1.4.3')) issues.push('Bad fixture missing WCAG 1.4.3');
  }

  if (fixtureType === 'spa') {
    if ((report.meta?.routesAudited || report.results.length) < 2) {
      issues.push('SPA fixture did not produce multiple routes');
    }
  }

  if (fixtureType === 'auth') {
    const errors = extractToolErrors(report);
    if (context.expectAuthFailure) {
      if (errors.length === 0) issues.push('Auth fixture expected errors but none found');
    } else if (errors.length > 0) {
      issues.push(`Auth fixture errors with auth provided: ${errors.join('; ')}`);
    }
  }

  return issues;
}

function validatePublicBenchmark(report) {
  const issues = [];
  const lhScore = report.results[0]?.lhScore;
  if (typeof lhScore !== 'number' || lhScore < 0 || lhScore > 100) {
    issues.push('Lighthouse score missing or out of range');
  }

  const coverage = coveragePercent(report.meta?.evidenceSummary);
  if (coverage < 70) {
    issues.push(`Evidence coverage below 70% (${coverage}%)`);
  }

  return issues;
}

function assessDeterminism(samples, label) {
  if (samples.length === 0) return { issues: [] };
  const issueCounts = samples.map((s) => s.totalIssues);
  const max = Math.max(...issueCounts);
  const min = Math.min(...issueCounts);
  const avg = issueCounts.reduce((a, b) => a + b, 0) / issueCounts.length;
  const drift = avg === 0 ? 0 : (max - min) / avg;

  const complianceLevels = samples.map((s) => complianceOrder[s.complianceLevel] ?? 0);
  const complianceDrift = Math.max(...complianceLevels) - Math.min(...complianceLevels);

  const issues = [];
  if (drift > 0.1) issues.push(`${label} issue count drift > 10%`);
  if (complianceDrift > 1) issues.push(`${label} compliance drift > 1 level`);

  return { issues, drift, complianceDrift };
}

async function runCli({ url, limit, outDir, extraArgs = [], envOverrides = {} }) {
  const cliArgs = [
    indexPath,
    '--url',
    url,
    '--limit',
    String(limit),
    '--format',
    DEFAULT_FORMATS,
    '--outDir',
    outDir,
    '--no-interactive',
  ];
  if (process.env.A11Y_NO_SANDBOX === '1' || process.env.CI === 'true') {
    cliArgs.push('--no-sandbox');
  }

  const result = spawnSync(process.execPath, [...cliArgs, ...extraArgs], {
    encoding: 'utf8',
    env: {
      ...process.env,
      A11Y_SKIP_OPEN_HTML: '1',
      ...envOverrides,
    },
  });

  return result;
}

async function loadArtifacts(filePaths) {
  const artifacts = { files: filePaths };
  const jsonPath = filePaths.find((f) => f.endsWith('.json'));
  const htmlPath = filePaths.find((f) => f.endsWith('.html'));
  const csvPath = filePaths.find((f) => f.endsWith('.csv'));
  const sarifPath = filePaths.find((f) => f.endsWith('.sarif'));

  if (jsonPath) artifacts.json = jsonPath;
  if (htmlPath) artifacts.html = htmlPath;
  if (csvPath) artifacts.csv = csvPath;
  if (sarifPath) artifacts.sarif = sarifPath;

  if (htmlPath) {
    artifacts.htmlContent = await fs.readFile(htmlPath, 'utf8');
  }
  if (csvPath) {
    const csv = await fs.readFile(csvPath, 'utf8');
    artifacts.csvHeader = csv.split('\n')[0] || '';
  }
  if (sarifPath) {
    artifacts.sarifContent = JSON.parse(await fs.readFile(sarifPath, 'utf8'));
  }

  return artifacts;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function startFixtureServerProcess(port = 4173) {
  const serverPath = path.join(repoRoot, 'scripts/fixtures/run-server.js');
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const readyLine = `Fixture server running on http://localhost:${port}`;
  const startTimeoutMs = 10000;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for fixture server to start'));
    }, startTimeoutMs);

    const onData = (data) => {
      const text = data.toString();
      if (text.includes(readyLine)) {
        clearTimeout(timeout);
        child.stdout?.off('data', onData);
        resolve();
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', (data) => {
      // Surface server startup errors early.
      const text = data.toString();
      if (text.toLowerCase().includes('error')) {
        clearTimeout(timeout);
        reject(new Error(text.trim()));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Fixture server exited early with code ${code}`));
      }
    });
  });

  return child;
}

async function main() {
  await ensureDir(outDir);
  const benchmarks = JSON.parse(await fs.readFile(benchmarksPath, 'utf8'));

  const summary = {
    timestamp,
    scope,
    runs: [],
    determinism: [],
    failures: 0,
  };

  let serverProcess = null;
  if (scope === 'all' || scope === 'local') {
    logSection('Starting fixture server');
    serverProcess = await startFixtureServerProcess(4173);
  }

  const runBenchmarks = [];
  if (scope === 'all' || scope === 'public') runBenchmarks.push(...benchmarks.public);
  if (scope === 'all' || scope === 'local') runBenchmarks.push(...benchmarks.local);

  for (const benchmark of runBenchmarks) {
    logSection(`Running ${benchmark.url}`);
    const isLocal = benchmark.url.includes('localhost');
    const fixtureType = isLocal ? benchmark.url.split('/').pop() : null;
    const extraArgs = [];
    if (fixtureType === 'auth') {
      extraArgs.push('--headers', '{"x-a11y-auth":"1"}');
    }

    const result = await runCli({
      url: benchmark.url,
      limit: benchmark.limit,
      outDir,
      extraArgs,
    });

    const files = parseGeneratedFiles(result.stdout || '');
    const record = {
      url: benchmark.url,
      status: result.status,
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      files,
      gates: [],
    };

    if (result.status !== 0) {
      record.gates.push('CLI exited with non-zero status');
    }

    if (files.length === 0) {
      record.gates.push('No reports generated');
      record.passed = false;
      summary.runs.push(record);
      summary.failures += 1;
      continue;
    }

    const artifacts = await loadArtifacts(files);
    if (!artifacts.json) {
      record.gates.push('Missing JSON report');
      record.passed = false;
      summary.runs.push(record);
      summary.failures += 1;
      continue;
    }

    const report = await loadJsonReport(artifacts.json);
    record.meta = report.meta;
    record.totalIssues = report.results[0]?.totalIssues ?? 0;
    record.complianceLevel = report.compliance?.level;

    record.gates.push(
      ...validateGlobal(report, artifacts, {
        allowErrors: !isLocal,
      })
    );

    if (isLocal) {
      record.gates.push(...validateLocalFixture(report, fixtureType, { expectAuthFailure: false }));
    } else {
      record.gates.push(...validatePublicBenchmark(report));
    }

    record.coverage = coveragePercent(report.meta?.evidenceSummary);
    record.passed = record.gates.length === 0;

    summary.runs.push(record);
    if (!record.passed) summary.failures += 1;
  }

  if (scope === 'all' || scope === 'local') {
    logSection('Running auth fixture validations');
    const authUrl = 'http://localhost:4173/auth';

    const authFail = await runCli({
      url: authUrl,
      limit: 1,
      outDir,
    });
    const authFailFiles = parseGeneratedFiles(authFail.stdout || '');
    if (authFailFiles.length > 0) {
      const report = await loadJsonReport(authFailFiles.find((f) => f.endsWith('.json')));
      const gates = validateLocalFixture(report, 'auth', { expectAuthFailure: true });
      summary.runs.push({
        url: `${authUrl} (no auth)`,
        status: authFail.status,
        files: authFailFiles,
        gates,
        passed: gates.length === 0,
      });
      if (gates.length > 0) summary.failures += 1;
    }

    const authOk = await runCli({
      url: authUrl,
      limit: 1,
      outDir,
      extraArgs: ['--headers', '{"x-a11y-auth":"1"}'],
    });
    const authOkFiles = parseGeneratedFiles(authOk.stdout || '');
    if (authOkFiles.length > 0) {
      const report = await loadJsonReport(authOkFiles.find((f) => f.endsWith('.json')));
      const gates = validateLocalFixture(report, 'auth', { expectAuthFailure: false });
      summary.runs.push({
        url: `${authUrl} (with auth)`,
        status: authOk.status,
        files: authOkFiles,
        gates,
        passed: gates.length === 0,
      });
      if (gates.length > 0) summary.failures += 1;
    }
  }

  logSection('Determinism checks');
  const determinismTargets = [
    { url: 'https://example.com/', label: 'example.com' },
    { url: 'http://localhost:4173/bad', label: 'fixture/bad' },
  ];

  for (const target of determinismTargets) {
    if (target.url.includes('localhost') && scope === 'public') continue;
    if (!target.url.includes('localhost') && scope === 'local') continue;

    const samples = [];
    for (let i = 0; i < 3; i += 1) {
      const run = await runCli({
        url: target.url,
        limit: 1,
        outDir,
      });
      const files = parseGeneratedFiles(run.stdout || '');
      if (files.length === 0) continue;
      const report = await loadJsonReport(files.find((f) => f.endsWith('.json')));
      samples.push({
        totalIssues: report.results[0]?.totalIssues ?? 0,
        complianceLevel: report.compliance?.level,
      });
    }

    const result = assessDeterminism(samples, target.label);
    summary.determinism.push({
      target: target.label,
      samples,
      drift: result.drift,
      complianceDrift: result.complianceDrift,
      issues: result.issues,
      passed: result.issues.length === 0,
    });
    if (result.issues.length > 0) summary.failures += 1;
  }

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }

  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  const summaryLines = [
    '# Accuracy Audit Summary',
    '',
    `Timestamp: ${timestamp}`,
    `Scope: ${scope}`,
    '',
    `Failures: ${summary.failures}`,
    '',
    '## Runs',
  ];

  for (const run of summary.runs) {
    summaryLines.push(`- ${run.url}: ${run.passed ? 'PASS' : 'FAIL'}`);
    if (run.gates && run.gates.length > 0) {
      for (const gate of run.gates) {
        summaryLines.push(`  - ${gate}`);
      }
    }
  }

  summaryLines.push('', '## Determinism');
  for (const det of summary.determinism) {
    summaryLines.push(`- ${det.target}: ${det.passed ? 'PASS' : 'FAIL'}`);
    if (det.issues.length > 0) {
      for (const issue of det.issues) {
        summaryLines.push(`  - ${issue}`);
      }
    }
  }

  await fs.writeFile(path.join(outDir, 'summary.md'), summaryLines.join('\n'));

  console.log(`\nSummary written to ${path.join(outDir, 'summary.md')}`);
  process.exit(summary.failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
