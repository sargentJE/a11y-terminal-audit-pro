import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeSampledPixels,
  extractContrastThreshold,
  parseColorString,
} from '../services/audit/verification/contrastVerifier.js';

test('extractContrastThreshold reads ratio from message with fallback', () => {
  assert.equal(
    extractContrastThreshold('Ensure the contrast ratio is at least 3:1 for large text.'),
    3
  );
  assert.equal(extractContrastThreshold('No explicit ratio in message.'), 4.5);
});

test('analyzeSampledPixels classifies failed when sampled contrast is below threshold', () => {
  const textRgb = parseColorString('rgb(255, 255, 255)');
  const sampledPixels = [
    [240, 240, 240, 255],
    [238, 238, 238, 255],
    [242, 242, 242, 255],
  ];

  const result = analyzeSampledPixels(sampledPixels, textRgb, 4.5, { minSamples: 1 });

  assert.equal(result.status, 'failed');
  assert.equal(result.sampleCount > 0, true);
  assert.equal(typeof result.minRatio, 'number');
  assert.equal(['low', 'medium', 'high'].includes(result.confidence), true);
});

test('analyzeSampledPixels classifies passed when sampled contrast meets threshold', () => {
  const textRgb = parseColorString('rgb(255, 255, 255)');
  const sampledPixels = [
    [32, 32, 32, 255],
    [16, 16, 16, 255],
    [0, 0, 0, 255],
  ];

  const result = analyzeSampledPixels(sampledPixels, textRgb, 4.5, { minSamples: 1 });

  assert.equal(result.status, 'passed');
  assert.equal(result.sampleCount > 0, true);
});

test('analyzeSampledPixels returns inconclusive when no usable samples exist', () => {
  const textRgb = parseColorString('rgb(255, 255, 255)');
  const sampledPixels = [
    [255, 255, 255, 255],
    [255, 255, 255, 200],
  ];

  const result = analyzeSampledPixels(sampledPixels, textRgb, 4.5);

  assert.equal(result.status, 'inconclusive');
  assert.equal(result.sampleCount <= 1, true);
  assert.equal(result.reasonCode === 'transparent-stack-uncertain' || result.reasonCode === 'insufficient-samples', true);
});
