import { ZOOM, LAYOUTS, EXPORT } from "./constants.js";
import { DEFAULT_CONFIG } from "./config-defaults.js";

/**
 * Check that a selector string can actually be used with querySelector.
 * @param {*} selector - Candidate selector
 * @returns {boolean} True when the selector is a non-empty, parseable string
 */
function isValidSelector(selector) {
  if (typeof selector !== "string" || !selector.trim()) return false;
  if (typeof document === "undefined") return true;
  try {
    document.querySelector(selector);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Validate entire configuration
 * @param {Record<string, *>} config - The config object to validate (mutated in place)
 * @param {Record<string, *>} [previous] - Config in effect before this update; invalid
 *   values fall back to it (and to the defaults when it has none)
 */
export function validateConfig(config, previous = DEFAULT_CONFIG) {
  const defaults = /** @type {Record<string, *>} */ (DEFAULT_CONFIG);
  /** @param {string} key - Config key */
  const fallback = (key) => (previous && key in previous ? previous[key] : defaults[key]);

  /**
   * @param {string} key - Config key to validate
   * @param {number} min - Minimum allowed value (inclusive)
   * @param {number} max - Maximum allowed value (inclusive)
   */
  const checkRange = (key, min, max) => {
    if (/** @type {number} */ (config[key]) < min || /** @type {number} */ (config[key]) > max) {
      console.warn(`DiagView: ${key} should be between ${min} and ${max}`);
      config[key] = defaults[key];
    }
  };

  checkRange("highResScale", 1, 10);
  checkRange("mobileScale", 1, 5);
  checkRange("maxZoomScale", 1, ZOOM.MAX_SCALE_LIMIT);
  checkRange("minZoomScale", ZOOM.MIN_SCALE_LIMIT, 1);
  checkRange("maxPixels", EXPORT.MIN_PIXELS_LIMIT, EXPORT.MAX_PIXELS_LIMIT);

  if (
    ![LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(
      /** @type {string} */ (config["layout"]),
    )
  ) {
    console.warn(`DiagView: Invalid layout "${config["layout"]}", using default`);
    config["layout"] = defaults["layout"];
  }

  if (!isValidSelector(config["diagramSelector"])) {
    console.warn(
      `DiagView: diagramSelector "${config["diagramSelector"]}" is not a valid selector, keeping "${fallback("diagramSelector")}"`,
    );
    config["diagramSelector"] = fallback("diagramSelector");
  }

  // Ensure positive values for timings
  [
    "helpTimeout",
    "toastDuration",
    "errorToastDuration",
    "zoomAnimationDuration",
    "panAnimationDuration",
  ].forEach((key) => {
    if (/** @type {number} */ (config[key]) < 0) {
      console.warn(`DiagView: ${key} must be positive`);
      config[key] = defaults[key];
    }
  });
}
