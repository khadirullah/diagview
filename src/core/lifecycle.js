// @ts-check
/**
 * DiagView Lifecycle Management
 * Utilities for cleanup, event management, and resource disposal
 * @module core/lifecycle
 */

import { state, addCleanupFunction } from "./config.js";

/**
 * Add cleanup function to be called specifically when the modal closes
 * @param {Function} fn - Cleanup function
 */
export function addModalCleanupFunction(fn) {
  if (typeof fn === "function") {
    state.modalCleanupFunctions.add(fn);
  }
}

/**
 * Safely destroy an instance with error handling
 * Prevents crashes from failed cleanup operations
 *
 * @param {Record<string, *>} instance - Object to destroy
 * @param {string} methodName - Method name to call (default: 'destroy')
 * @returns {boolean} True if destroyed successfully
 *
 * @example
 * safeDestroy(panzoomInstance);
 * safeDestroy(observer, 'disconnect');
 */
export function safeDestroy(instance, methodName = "destroy") {
  if (!instance) return false;

  if (typeof instance[methodName] !== "function") {
    return false;
  }

  try {
    instance[methodName]();
    return true;
  } catch (error) {
    console.warn(`DiagView: ${methodName} failed`, error);
    return false;
  }
}

/**
 * Add event listener with automatic cleanup on destroy
 * Prevents memory leaks from forgotten event listeners
 *
 * @param {EventTarget} target - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {object | boolean} options - Event listener options
 * @returns {Function} Cleanup function to remove listener
 *
 * @example
 * // Automatically cleaned up on destroy
 * addManagedListener(window, 'resize', handleResize);
 *
 * // Manual cleanup if needed
 * const cleanup = addManagedListener(button, 'click', handleClick);
 * cleanup(); // Remove listener manually
 */
export function addManagedListener(target, event, handler, options) {
  if (!target || !event || !handler) {
    console.warn("DiagView: Invalid arguments for addManagedListener");
    return () => {};
  }

  // Cast to EventListener — handler is always a valid event handler function
  const listener = /** @type {EventListener} */ (handler);

  // Attach listener
  target.addEventListener(event, listener, options);

  const cleanup = () => {
    target.removeEventListener(event, listener, options);
    // Unregister from auto-cleanup to prevent double-firing and memory leaks
    // MAJ-6: O(1) removal using Set.delete()
    state.cleanupFunctions.delete(cleanup);
  };

  // Register for automatic cleanup on destroy
  addCleanupFunction(cleanup);

  // Return cleanup function for manual removal if needed
  return cleanup;
}

/**
 * Add event listener with automatic cleanup on modal close
 * Used for focus traps and modal-specific interactions
 *
 * @param {EventTarget} target - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {object | boolean} options - Event listener options
 * @returns {Function} Cleanup function to remove listener
 */
export function addModalListener(target, event, handler, options) {
  if (!target || !event || !handler) return () => {};

  // Cast to EventListener — handler is always a valid event handler function
  const listener = /** @type {EventListener} */ (handler);

  target.addEventListener(event, listener, options);
  const cleanup = () => {
    target.removeEventListener(event, listener, options);
    // Unregister from modal auto-cleanup
    // MAJ-6: O(1) removal using Set.delete()
    state.modalCleanupFunctions.delete(cleanup);
  };

  addModalCleanupFunction(cleanup);
  return cleanup;
}
/**
 * Register a timeout with automatic cleanup
 * @param {import('./config.js').DiagViewState} state - Instance state
 * @param {Function} fn - Callback function
 * @param {number} delay - Delay in ms
 * @returns {ReturnType<typeof setTimeout>} Timeout ID
 */
export function registerTimeout(state, fn, delay) {
  const id = setTimeout(() => {
    state.asyncTasks.timeouts.delete(id);
    fn();
  }, delay);
  state.asyncTasks.timeouts.add(id);
  return id;
}

/**
 * Register a RequestAnimationFrame with automatic cleanup
 * @param {import('./config.js').DiagViewState} state - Instance state
 * @param {FrameRequestCallback} fn - Callback function
 * @returns {number} RAF ID
 */
export function registerRAF(state, fn) {
  const task = { id: 0 };
  task.id = requestAnimationFrame((timestamp) => {
    state.asyncTasks.rafs.delete(task.id);
    fn(timestamp);
  });
  state.asyncTasks.rafs.add(task.id);
  return task.id;
}

/**
 * Clear all pending async tasks for an instance
 * @param {import('./config.js').DiagViewState} state - Instance state
 */
export function clearAsyncTasks(state) {
  if (!state.asyncTasks) return;

  state.asyncTasks.timeouts.forEach((id) => clearTimeout(id));
  state.asyncTasks.rafs.forEach((id) => cancelAnimationFrame(id));

  state.asyncTasks.timeouts.clear();
  state.asyncTasks.rafs.clear();
}
