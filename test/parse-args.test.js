import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../cli/parseArgs.js';

test('parseArgs supports repeated --tool flags', () => {
  const args = parseArgs(['--tool', 'axe', '--tool', 'pa11y']);
  assert.deepEqual(args.tool, ['axe', 'pa11y']);
});

test('parseArgs keeps comma-separated --tool values as provided tokens', () => {
  const args = parseArgs(['--tool', 'axe,pa11y']);
  assert.equal(args.tool, 'axe,pa11y');
});

test('parseArgs supports mixed repeated/comma --tool forms', () => {
  const args = parseArgs(['--tool', 'axe,pa11y', '--tool', 'lighthouse']);
  assert.deepEqual(args.tool, ['axe,pa11y', 'lighthouse']);
});

test('parseArgs throws for missing --tool value', () => {
  assert.throws(() => parseArgs(['--tool']), /Missing value for --tool/);
});
