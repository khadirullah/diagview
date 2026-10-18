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
 * @param {*} value - Candidate value
 * @returns {boolean} True for a plain object (not null, array or class instance)
 */
export function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Keys that reach an object's prototype instead of the object itself.
 * JSON.parse('{"__proto__": {...}}') makes "__proto__" an own key, and
 * merging it would write to Object.prototype.
 * @private
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Perform a deep merge of source into target. Keys in UNSAFE_KEYS are
 * skipped at every depth.
 * @param {Record<string, *>} target - The object to merge into
 * @param {Record<string, *>} source - The object to merge from
 * @returns {Record<string, *>} The mutated target object
 */
export function deepMerge(target, source) {
  if (!source) return target;
  Object.keys(source).forEach((key) => {
    if (UNSAFE_KEYS.has(key)) return;
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
