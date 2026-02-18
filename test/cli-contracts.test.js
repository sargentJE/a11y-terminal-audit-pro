import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..');
const entrypoint = path.join(repoRoot, 'index.js');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'a11y-cli-contracts-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCli(args, cwd = repoRoot, envOverrides = {}) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      A11Y_SKIP_OPEN_HTML: '1',
      ...envOverrides,
    },
  });
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

test('CLI help contract includes key options and exits successfully', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /A11Y TERMINAL AUDIT PRO/i);
  assert.match(result.stdout, /--csv-legacy/);
  assert.match(result.stdout, /--tool <name\[,name\.\.\.\]>/);
  assert.match(result.stdout, /--max-serious <n>/);
  assert.match(result.stdout, /--evidence-timeout <ms>/);
  assert.match(result.stdout, /--include-manual-checks/);
  assert.match(result.stdout, /--verification-v2/);
  assert.match(result.stdout, /--verification-confidence-threshold <level>/);
});

test('CLI no-interactive mode fails fast when URL is missing', () => {
  return withTempDir(async (tempDir) => {
    const result = runCli(['--no-interactive'], tempDir);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(combinedOutput, /url is required/i);
  });
});

test('--min-score fails fast when Lighthouse is not selected', () => {
  return withTempDir(async (tempDir) => {
    const result = runCli(
      ['--url', 'https://example.com', '--tool', 'axe', '--min-score', '80', '--no-interactive'],
      tempDir
    );
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(combinedOutput, /--min-score requires Lighthouse/i);
    assert.doesNotMatch(combinedOutput, /Default scan tool is axe/i);
  });
});

test('implicit default tool warning appears once when no tools are explicitly selected', () => {
  return withTempDir(async (tempDir) => {
    const result = runCli(
      ['--url', 'https://example.com', '--min-score', '80', '--no-interactive'],
      tempDir
    );
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(combinedOutput, /Default scan tool is axe/i);
    assert.match(combinedOutput, /--tool lighthouse,axe,pa11y/i);
    assert.equal(countMatches(combinedOutput, /Default scan tool is axe/gi), 1);
  });
});

test('implicit default tool warning can be suppressed in CI environments', () => {
  return withTempDir(async (tempDir) => {
    const result = runCli(
      ['--url', 'https://example.com', '--min-score', '80', '--no-interactive'],
      tempDir,
      { A11Y_SUPPRESS_TOOL_DEFAULT_WARNING: '1' }
    );
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1);
    assert.doesNotMatch(combinedOutput, /Default scan tool is axe/i);
    assert.match(combinedOutput, /--min-score requires Lighthouse/i);
  });
});

test('invalid --tool value fails fast', () => {
  return withTempDir(async (tempDir) => {
    const result = runCli(
      ['--url', 'https://example.com', '--tool', 'unknown-tool', '--no-interactive'],
      tempDir
    );
    const combinedOutput = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 1);
    assert.match(combinedOutput, /Unknown tool/i);
  });
});

test('CLI init command generates sample config contract', async () => {
  await withTempDir(async (tempDir) => {
    const result = runCli(['--init'], tempDir);
    assert.equal(result.status, 0);

    const configPath = path.join(tempDir, '.a11yrc.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));

    assert.equal(config.report.csvLegacy, false);
    assert.equal(config.thresholds.maxSerious, 5);
    assert.equal(config.evidence.maxOpsPerPage, 500);
    assert.equal(config.browser.noSandbox, false);
    assert.equal(config.compliance.includeManualChecks, false);
    assert.equal(config.verification.v2, false);
    assert.equal(config.verification.confidenceThreshold, 'high');
    assert.deepEqual(config.tools, ['axe']);
  });
});
