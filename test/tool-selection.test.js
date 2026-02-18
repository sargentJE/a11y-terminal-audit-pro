import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_SELECTION_ERROR_CODES,
  ToolSelectionError,
  parseToolSelection,
  resolveSelectedTools,
  validateToolThresholdCompatibility,
} from '../utils/toolSelection.js';

test('parseToolSelection normalizes case, de-duplicates, and preserves canonical order', () => {
  const tools = parseToolSelection(['PA11Y', 'axe,lighthouse', 'axe']);
  assert.deepEqual(tools, ['lighthouse', 'axe', 'pa11y']);
});

test('parseToolSelection rejects unknown tools', () => {
  assert.throws(() => parseToolSelection('axe,not-a-tool'), (error) => {
    assert.equal(error instanceof ToolSelectionError, true);
    assert.equal(error.code, TOOL_SELECTION_ERROR_CODES.UNKNOWN);
    assert.match(error.message, /Unknown tool\(s\): not-a-tool/);
    return true;
  });
});

test('parseToolSelection rejects empty selections', () => {
  assert.throws(() => parseToolSelection(' , , '), (error) => {
    assert.equal(error instanceof ToolSelectionError, true);
    assert.equal(error.code, TOOL_SELECTION_ERROR_CODES.EMPTY);
    assert.match(error.message, /No tools selected/i);
    return true;
  });
});

test('resolveSelectedTools defaults to axe when undefined', () => {
  assert.deepEqual(resolveSelectedTools(undefined), ['axe']);
});

test('validateToolThresholdCompatibility rejects min-score without lighthouse', () => {
  assert.throws(() => validateToolThresholdCompatibility(['axe'], { minScore: 80 }), (error) => {
    assert.equal(error instanceof ToolSelectionError, true);
    assert.equal(error.code, TOOL_SELECTION_ERROR_CODES.INCOMPATIBLE_THRESHOLD);
    assert.match(error.message, /--min-score requires Lighthouse/i);
    return true;
  });
});

test('validateToolThresholdCompatibility allows min-score when lighthouse selected', () => {
  assert.doesNotThrow(() =>
    validateToolThresholdCompatibility(['lighthouse', 'axe'], { minScore: 80 })
  );
});
