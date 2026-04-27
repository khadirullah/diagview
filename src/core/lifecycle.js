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
    state.modalCleanupFunctions.push(fn);
  }
}

/**
 * Safely destroy an instance with error handling
 * Prevents crashes from failed cleanup operations
 *
 * @param {object} instance - Object to destroy
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
    // console.warn(`DiagView: Instance doesn't have method "${methodName}"`);
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

  // Attach listener
  target.addEventListener(event, handler, options);

  // Create cleanup function
  const cleanup = () => {
    target.removeEventListener(event, handler, options);
    // Unregister from auto-cleanup to prevent double-firing and memory leaks
    const idx = state.cleanupFunctions.indexOf(cleanup);
    if (idx !== -1) state.cleanupFunctions.splice(idx, 1);
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

  target.addEventListener(event, handler, options);
  const cleanup = () => {
    target.removeEventListener(event, handler, options);
    // Unregister from modal auto-cleanup
    const idx = state.modalCleanupFunctions.indexOf(cleanup);
    if (idx !== -1) state.modalCleanupFunctions.splice(idx, 1);
  };

  addModalCleanupFunction(cleanup);
  return cleanup;
}



