/**
 * State Management Utilities
 * Provides deep-merge and deep-freeze functionality for immutable state management.
 * @module core/state-utils
 */

/**
 * Recursively freeze an object and all its nested properties.
 * @param {Record<string, *>} obj - The object to deeply freeze.
 * @returns {Record<string, *>} The same object, now deeply frozen.
 */
export function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const value = obj[name];
    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
}

/**
 * Perform a deep merge of source into target.
 * @param {Record<string, *>} target - The object to merge into
 * @param {Record<string, *>} source - The object to merge from
 * @returns {Record<string, *>} The mutated target object
 */
export function deepMerge(target, source) {
  if (!source) return target;
  Object.keys(source).forEach((key) => {
    if (source[key] && typeof source[key] === "object") {
      if (Array.isArray(source[key])) {
        // Fix for Bug #12: Clone arrays to prevent shared references
        target[key] = [...source[key]];
      } else {
        if (!target[key] || typeof target[key] !== "object") target[key] = {};
        deepMerge(target[key], source[key]);
      }
    } else {
      target[key] = source[key];
    }
  });
  return target;
}
