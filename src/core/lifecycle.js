/**
 * DiagView Lifecycle Management
 * Utilities for cleanup, event management, and resource disposal
 * @module core/lifecycle
 */

import { addCleanupFunction } from "./config.js";

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
export function safeDestroy(instance, methodName = 'destroy') {
  if (!instance) return false;

  if (typeof instance[methodName] !== 'function') {
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
    console.warn('DiagView: Invalid arguments for addManagedListener');
    return () => { };
  }

  // Attach listener
  target.addEventListener(event, handler, options);

  // Create cleanup function
  const cleanup = () => {
    target.removeEventListener(event, handler, options);
  };

  // Register for automatic cleanup on destroy
  addCleanupFunction(cleanup);

  // Return cleanup function for manual removal if needed
  return cleanup;
}

/**
 * Add multiple event listeners at once with automatic cleanup
 * 
 * @param {EventTarget} target - Element to attach listeners to
 * @param {object} events - Object mapping event names to handlers
 * @param {object | boolean} options - Event listener options
 * @returns {Function} Cleanup function to remove all listeners
 * 
 * @example
 * addManagedListeners(viewport, {
 *   wheel: handleWheel,
 *   mousedown: handleMouseDown,
 *   touchstart: handleTouchStart
 * }, { passive: false });
 */
export function addManagedListeners(target, events, options) {
  const cleanups = [];

  for (const [event, handler] of Object.entries(events)) {
    const cleanup = addManagedListener(target, event, handler, options);
    cleanups.push(cleanup);
  }

  // Return function that cleans up all listeners
  return () => {
    cleanups.forEach(cleanup => cleanup());
  };
}

/**
 * Create a disposable resource with cleanup tracking
 * Useful for complex resources that need guaranteed cleanup
 * 
 * @param {Function} createFn - Function that creates the resource
 * @param {Function} disposeFn - Function that disposes the resource
 * @returns {object} Resource with dispose method
 * 
 * @example
 * const timer = createDisposable(
 *   () => setInterval(update, 1000),
 *   (id) => clearInterval(id)
 * );
 * // ... later
 * timer.dispose(); // Automatically called on destroy too
 */
export function createDisposable(createFn, disposeFn) {
  const resource = createFn();

  const dispose = () => {
    if (disposeFn) {
      try {
        disposeFn(resource);
      } catch (error) {
        console.warn('DiagView: Dispose failed', error);
      }
    }
  };

  // Auto-cleanup on destroy
  addCleanupFunction(dispose);

  return {
    resource,
    dispose
  };
}

/**
 * Safely remove DOM element with cleanup
 * Removes element and clears any associated data
 * 
 * @param {HTMLElement|string} elementOrId - Element or element ID to remove
 * @returns {boolean} True if removed successfully
 * 
 * @example
 * safeRemoveElement('diagview-modal');
 * safeRemoveElement(modalElement);
 */
export function safeRemoveElement(elementOrId) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) return false;

  try {
    element.remove();
    return true;
  } catch (error) {
    console.warn('DiagView: Element removal failed', error);
    return false;
  }
}

/**
 * Batch cleanup of multiple DOM elements
 * 
 * @param {Array<string|HTMLElement>} elements - Array of elements or IDs
 * @returns {number} Number of elements successfully removed
 * 
 * @example
 * batchRemoveElements([
 *   'diagview-modal',
 *   'diagview-toast',
 *   modalElement
 * ]);
 */
export function batchRemoveElements(elements) {
  let removed = 0;

  elements.forEach(element => {
    if (safeRemoveElement(element)) {
      removed++;
    }
  });

  return removed;
}

/**
 * Create a one-time event listener that auto-removes
 * 
 * @param {EventTarget} target - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler function
 * @param {object | boolean} options - Event listener options
 * 
 * @example
 * onceListener(button, 'click', () => {
 *   console.log('Clicked once, listener removed');
 * });
 */
export function onceListener(target, event, handler, options) {
  const wrappedHandler = (e) => {
    handler(e);
    target.removeEventListener(event, wrappedHandler, options);
  };

  target.addEventListener(event, wrappedHandler, options);
}
