import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';

import { Config } from '../utils/Config.js';
import { TOOL_SELECTION_ERROR_CODES, ToolSelectionError } from '../utils/toolSelection.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'a11y-config-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Config.load flags threshold metadata when config file provides thresholds', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.a11yrc.json'),
      JSON.stringify({
        url: 'https://example.com',
        thresholds: {
          maxCritical: 0,
        },
      })
    );

    const config = await Config.load(dir, {});
    assert.equal(config.__meta.hasUserThresholds, true);
  });
});

test('Config.load does not flag threshold metadata when thresholds are absent', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.a11yrc.json'),
      JSON.stringify({
        url: 'https://example.com',
      })
    );

    const config = await Config.load(dir, {});
    assert.equal(config.__meta.hasUserThresholds, false);
  });
});

test('Config.load flags threshold metadata when CLI args provide thresholds', async () => {
  await withTempDir(async (dir) => {
    const config = await Config.load(dir, {
      thresholds: {
        maxSerious: 3,
      },
    });

    assert.equal(config.__meta.hasUserThresholds, true);
  });
});

test('Config.load merges evidence defaults with CLI overrides', async () => {
  await withTempDir(async (dir) => {
    const config = await Config.load(dir, {
      evidence: {
        enabled: false,
        contextLines: 4,
      },
    });

    assert.equal(config.evidence.enabled, false);
    assert.equal(config.evidence.contextLines, 4);
    assert.equal(config.evidence.maxChars, 2000);
    assert.equal(config.evidence.maxOpsPerPage, 500);
  });
});

test('Config.load supports report.csvLegacy overrides and defaults', async () => {
  await withTempDir(async (dir) => {
    const configDefault = await Config.load(dir, {});
    assert.equal(configDefault.report.csvLegacy, false);

    const configOverride = await Config.load(dir, {
      report: {
        csvLegacy: true,
      },
    });
    assert.equal(configOverride.report.csvLegacy, true);
  });
});

test('Config.load defaults and overrides compliance.includeManualChecks', async () => {
  await withTempDir(async (dir) => {
    const configDefault = await Config.load(dir, {});
    assert.equal(configDefault.compliance.includeManualChecks, false);

    const configOverride = await Config.load(dir, {
      compliance: {
        includeManualChecks: true,
      },
    });
    assert.equal(configOverride.compliance.includeManualChecks, true);
  });
});

test('Config.load defaults and overrides verification settings', async () => {
  await withTempDir(async (dir) => {
    const configDefault = await Config.load(dir, {});
    assert.equal(configDefault.verification.v2, false);
    assert.equal(configDefault.verification.deterministic, false);
    assert.equal(configDefault.verification.confidenceThreshold, 'high');
    assert.equal(configDefault.verification.gridSize, 24);

    const configOverride = await Config.load(dir, {
      verification: {
        v2: true,
        deterministic: true,
        confidenceThreshold: 'medium',
        gridSize: 32,
      },
    });
    assert.equal(configOverride.verification.v2, true);
    assert.equal(configOverride.verification.deterministic, true);
    assert.equal(configOverride.verification.confidenceThreshold, 'medium');
    assert.equal(configOverride.verification.gridSize, 32);
  });
});

test('Config.load defaults tools to axe', async () => {
  await withTempDir(async (dir) => {
    const config = await Config.load(dir, {});
    assert.deepEqual(config.tools, ['axe']);
  });
});

test('Config.load supports tools from config file string and normalizes order', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.a11yrc.json'),
      JSON.stringify({
        url: 'https://example.com',
        tools: 'pa11y,axe',
      })
    );

    const config = await Config.load(dir, {});
    assert.deepEqual(config.tools, ['axe', 'pa11y']);
    assert.equal(config.__meta.hasUserToolsSelection, true);
  });
});

test('Config.load applies CLI tools override over config tools', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.a11yrc.json'),
      JSON.stringify({
        url: 'https://example.com',
        tools: ['axe', 'pa11y'],
      })
    );

    const config = await Config.load(dir, {
      tools: ['lighthouse'],
    });

    assert.deepEqual(config.tools, ['lighthouse']);
    assert.equal(config.__meta.hasUserToolsSelection, true);
  });
});

test('Config.load throws for invalid tool names in config file', async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, '.a11yrc.json'),
      JSON.stringify({
        url: 'https://example.com',
        tools: ['axe', 'invalid'],
      })
    );

    await assert.rejects(() => Config.load(dir, {}), (error) => {
      assert.equal(error instanceof ToolSelectionError, true);
      assert.equal(error.code, TOOL_SELECTION_ERROR_CODES.UNKNOWN);
      assert.match(error.message, /Unknown tool/i);
      return true;
    });
  });
});
