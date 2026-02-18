import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..');
const entrypoint = path.join(repoRoot, 'index.js');

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'a11y-tool-matrix-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCli(args, { cwd = repoRoot, envOverrides = {} } = {}) {
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

async function startFixtureServerProcess(port) {
  const serverPath = path.join(repoRoot, 'scripts/fixtures/run-server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const readyLine = `Fixture server running on http://localhost:${port}`;
  const startupTimeoutMs = 10_000;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for fixture server startup'));
    }, startupTimeoutMs);

    const onStdout = (data) => {
      if (data.toString().includes(readyLine)) {
        clearTimeout(timeout);
        child.stdout?.off('data', onStdout);
        resolve();
      }
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        clearTimeout(timeout);
        reject(new Error(`Fixture server stderr: ${text.trim()}`));
      }
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
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

async function stopFixtureServerProcess(child) {
  if (!child || child.exitCode != null) return;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 3_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

async function readSingleJsonReport(outDir) {
  const files = await readdir(outDir);
  const jsonFile = files.find((f) => f.endsWith('.json'));
  assert.ok(jsonFile, `Expected JSON report in ${outDir}`);
  const content = await readFile(path.join(outDir, jsonFile), 'utf8');
  return JSON.parse(content);
}

function buildArgs({ url, outDir, tool, extraArgs = [], limit = 1 }) {
  return [
    '--url',
    url,
    '--tool',
    tool,
    '--limit',
    String(limit),
    '--format',
    'json',
    '--outDir',
    outDir,
    '--no-interactive',
    ...extraArgs,
  ];
}

test('tool selection integration matrix uses expected execution semantics', async (t) => {
  const port = 4300 + Math.floor(Math.random() * 1500);
  const fixtureServer = await startFixtureServerProcess(port);

  try {
    await withTempDir(async (baseDir) => {
      await t.test('axe-only run marks non-selected tools as skipped and writes canonical meta.tools', async () => {
        const outDir = path.join(baseDir, 'axe-only');
        const result = runCli(buildArgs({ url: `http://localhost:${port}/good`, outDir, tool: 'axe' }), {
          cwd: baseDir,
        });

        assert.equal(result.status, 0);
        assert.match(result.stdout, /Scanned Tools:\s+axe/i);
        assert.match(result.stdout, /SKIP means not selected/i);
        assert.match(result.stdout, /SKIP/);

        const report = await readSingleJsonReport(outDir);
        assert.deepEqual(report.meta.tools, ['axe']);
        assert.equal(report.meta.thresholdScope, 'selected-tools-only');

        const row = report.results[0];
        assert.equal(typeof row.axeViolations, 'number');
        assert.equal(row.lhScore, null);
        assert.equal(row.pa11yIssues, null);
      });

      await t.test('lighthouse-only run reports Lighthouse metric and skips other tools', async () => {
        const outDir = path.join(baseDir, 'lighthouse-only');
        const result = runCli(
          buildArgs({ url: `http://localhost:${port}/good`, outDir, tool: 'lighthouse' }),
          { cwd: baseDir }
        );

        assert.equal(result.status, 0);
        assert.match(result.stdout, /Scanned Tools:\s+lighthouse/i);
        assert.match(result.stdout, /SKIP/);

        const report = await readSingleJsonReport(outDir);
        assert.deepEqual(report.meta.tools, ['lighthouse']);

        const row = report.results[0];
        assert.equal(typeof row.lhScore, 'number');
        assert.equal(row.axeViolations, null);
        assert.equal(row.pa11yIssues, null);
      });

      await t.test('all-tools run records canonical tool ordering and all tool metrics', async () => {
        const outDir = path.join(baseDir, 'all-tools');
        const result = runCli(
          buildArgs({
            url: `http://localhost:${port}/good`,
            outDir,
            tool: 'pa11y,axe,lighthouse',
          }),
          { cwd: baseDir }
        );

        assert.equal(result.status, 0);

        const report = await readSingleJsonReport(outDir);
        assert.deepEqual(report.meta.tools, ['lighthouse', 'axe', 'pa11y']);

        const row = report.results[0];
        assert.equal(typeof row.lhScore, 'number');
        assert.equal(typeof row.axeViolations, 'number');
        assert.equal(typeof row.pa11yIssues, 'number');
      });

      await t.test('selected tool failures render ERR semantics while unselected remain SKIP', async () => {
        const outDir = path.join(baseDir, 'selected-failure');
        const result = runCli(buildArgs({ url: `http://localhost:${port}/auth`, outDir, tool: 'axe' }), {
          cwd: baseDir,
        });

        assert.equal(result.status, 0);
        assert.match(result.stdout, /Axe:\s+ERR/i);
        assert.match(result.stdout, /SKIP/);

        const report = await readSingleJsonReport(outDir);
        const row = report.results[0];
        assert.equal(row.axeViolations, null);
        assert.equal(typeof row.errors?.axe?.message, 'string');
      });

      await t.test('preflight fails when --min-score is used without Lighthouse', async () => {
        const outDir = path.join(baseDir, 'preflight-fail');
        const result = runCli(
          buildArgs({
            url: `http://localhost:${port}/good`,
            outDir,
            tool: 'axe',
            extraArgs: ['--min-score', '80'],
          }),
          { cwd: baseDir }
        );
        const combinedOutput = `${result.stdout}\n${result.stderr}`;

        assert.equal(result.status, 1);
        assert.match(combinedOutput, /--min-score requires Lighthouse/i);
      });
    });
  } finally {
    await stopFixtureServerProcess(fixtureServer);
  }
});
