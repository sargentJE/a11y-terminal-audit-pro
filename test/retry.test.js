import test from 'node:test';
import assert from 'node:assert/strict';

import { withRetry } from '../services/audit/shared/retry.js';

const noopLogger = {
  debug: () => {},
};

test('withRetry eventually succeeds within retry budget', async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('transient failure');
      }
      return 'ok';
    },
    3,
    1,
    'transient op',
    noopLogger
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('withRetry throws final error after retries exhausted', async () => {
  let attempts = 0;

  await assert.rejects(
    async () =>
      withRetry(
        async () => {
          attempts += 1;
          throw new Error(`permanent-${attempts}`);
        },
        2,
        1,
        'permanent op',
        noopLogger
      ),
    /permanent-3/
  );
});
