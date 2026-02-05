/**
 * Pop the highest-priority item (lowest numeric priority).
 *
 * @template T
 * @param {Array<{priority: number} & T>} queue
 * @returns {({priority: number} & T)|undefined}
 */
export function popNext(queue) {
  queue.sort((a, b) => a.priority - b.priority);
  return queue.shift();
}

/**
 * Push queue candidate.
 *
 * @template T
 * @param {Array<T>} queue
 * @param {T} candidate
 */
export function pushCandidate(queue, candidate) {
  queue.push(candidate);
}
