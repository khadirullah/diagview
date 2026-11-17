/**
 * Waiting helpers shared by the unit tests.
 */

/**
 * Wait real time, so timers, promises and observer callbacks get to run.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>} Resolves after the wait
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait one macrotask turn, so pending promise callbacks run first.
 * @returns {Promise<void>} Resolves on the next turn
 */
export const flush = () => wait(0);

/**
 * Run the frame callbacks a test collected from requestAnimationFrame.
 * Callbacks they queue in turn wait for the next call.
 * @param {Function[]} queue - Collected callbacks, emptied by the call
 */
export function flushRaf(queue) {
  queue.splice(0).forEach((cb) => cb());
}
