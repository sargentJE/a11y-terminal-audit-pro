/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} maxRetries
 * @param {number} baseDelay
 * @param {string} operationName
 * @param {{ debug: (msg: string) => void }} log
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxRetries, baseDelay, operationName, log) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.debug(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export default withRetry;
