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

function runCli(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  });
}

test('CLI help contract includes key options and exits successfully', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /A11Y TERMINAL AUDIT PRO/i);
  assert.match(result.stdout, /--csv-legacy/);
  assert.match(result.stdout, /--max-serious <n>/);
  assert.match(result.stdout, /--evidence-timeout <ms>/);
});

test('CLI no-interactive mode fails fast when URL is missing', () => {
  const result = runCli(['--no-interactive']);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(combinedOutput, /url is required/i);
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
  });
});
