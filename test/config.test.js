import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';

import { Config } from '../utils/Config.js';

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
