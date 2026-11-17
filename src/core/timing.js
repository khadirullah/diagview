/**
 * DiagView timing helpers
 * @module core/timing
 */

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {number} [maxWait=Infinity] - Longest time in milliseconds a call
 *   waits while new calls keep pushing it back
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, maxWait = Infinity) {
  let timeout;
  // When the first call still waiting came in
  let firstCall = 0;
  const executedFunction = function (...args) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    const now = Date.now();
    if (!timeout) firstCall = now;
    clearTimeout(timeout);
    timeout = setTimeout(later, Math.max(0, Math.min(wait, firstCall + maxWait - now)));
  };
  executedFunction.cancel = function () {
    clearTimeout(timeout);
    timeout = null;
  };
  return executedFunction;
}

/**
 * Throttle function execution with trailing-edge support
 * @param {Function} func - Function to throttle
 * @param {number} limit - Throttle limit in ms
 * @returns {any|undefined} - Function result if executed, undefined if throttled
 */
export function throttle(func, limit) {
  let inThrottle;
  let lastFunc;
  let lastResult;
  let timeout;

  const throttledFunc = function (...args) {
    const context = this;
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      timeout = setTimeout(() => {
        inThrottle = false;
        if (lastFunc) {
          lastResult = func.apply(lastFunc.context, lastFunc.args);
          lastFunc = null;
        }
      }, limit);
      return lastResult;
    } else {
      lastFunc = { context, args };
      return undefined;
    }
  };

  // A trailing call is waiting to run
  throttledFunc.pending = () => !!lastFunc;

  throttledFunc.cancel = function () {
    clearTimeout(timeout);
    inThrottle = false;
    lastFunc = null;
  };

  return throttledFunc;
}
