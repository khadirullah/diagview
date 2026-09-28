import { ZOOM, LAYOUTS, EXPORT, SECURITY_MODES } from "./constants.js";
import { DEFAULT_CONFIG } from "./config-defaults.js";
import { deepMerge } from "./state-utils.js";

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
 * @param {*} value - Candidate value
 * @returns {boolean} True for a plain object (not null, array or class instance)
 */
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
   * Numeric keys must be finite numbers inside [min, max].
   * @param {string} key - Config key to validate
   * @param {number} min - Minimum allowed value (inclusive)
   * @param {number} max - Maximum allowed value (inclusive)
   */
  const checkNumber = (key, min, max) => {
    const value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      console.warn(`DiagView: ${key} must be a number, keeping ${fallback(key)}`);
      config[key] = fallback(key);
    } else if (value < min || value > max) {
      const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`;
      console.warn(`DiagView: ${key} should be ${range}`);
      config[key] = fallback(key);
    }
  };

  checkNumber("highResScale", 1, 10);
  checkNumber("mobileScale", 1, 5);
  checkNumber("maxZoomScale", 1, ZOOM.MAX_SCALE_LIMIT);
  checkNumber("minZoomScale", ZOOM.MIN_SCALE_LIMIT, 1);
  checkNumber("maxPixels", EXPORT.MIN_PIXELS_LIMIT, EXPORT.MAX_PIXELS_LIMIT);

  if (config["minZoomScale"] > config["maxZoomScale"]) {
    console.warn(
      `DiagView: minZoomScale (${config["minZoomScale"]}) must not exceed maxZoomScale (${config["maxZoomScale"]}), keeping previous values`,
    );
    config["minZoomScale"] = fallback("minZoomScale");
    config["maxZoomScale"] = fallback("maxZoomScale");
  }

  if (
    ![LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(
      /** @type {string} */ (config["layout"]),
    )
  ) {
    console.warn(`DiagView: Invalid layout "${config["layout"]}", using default`);
    config["layout"] = defaults["layout"];
  }

  if (!["none", "dots"].includes(/** @type {string} */ (config["canvasGrid"]))) {
    console.warn(
      `DiagView: canvasGrid must be "none" or "dots", keeping "${fallback("canvasGrid")}"`,
    );
    config["canvasGrid"] = fallback("canvasGrid");
  }

  if (!["used", "all", "none"].includes(/** @type {string} */ (config["exportFonts"]))) {
    console.warn(
      `DiagView: exportFonts must be "used", "all" or "none", keeping "${fallback("exportFonts")}"`,
    );
    config["exportFonts"] = fallback("exportFonts");
  }

  if (!isValidSelector(config["diagramSelector"])) {
    console.warn(
      `DiagView: diagramSelector "${config["diagramSelector"]}" is not a valid selector, keeping "${fallback("diagramSelector")}"`,
    );
    config["diagramSelector"] = fallback("diagramSelector");
  }

  // Nested option groups must stay objects: a scalar, null or array would
  // replace the whole group and break every `config.group.key` read.
  ["security", "watermark", "ui", "performance"].forEach((key) => {
    if (!isPlainObject(config[key])) {
      console.warn(`DiagView: ${key} must be an object, keeping previous settings`);
      config[key] = deepMerge({}, fallback(key));
    }
  });

  // An unknown mode would work as strict, so say so and store that
  const { mode } = config["security"];
  if (!SECURITY_MODES.includes(mode)) {
    console.warn(`DiagView: Unknown security.mode "${mode}", using "strict"`);
    config["security"].mode = "strict";
  }

  const { exportMode } = config["security"];
  if (exportMode !== "same" && exportMode !== "strict") {
    console.warn(`DiagView: Unknown security.exportMode "${exportMode}", using "same"`);
    config["security"].exportMode = "same";
  }

  const types = config["allowedImageTypes"];
  if (!Array.isArray(types) || !types.every((t) => typeof t === "string")) {
    console.warn("DiagView: allowedImageTypes must be an array of strings, keeping previous value");
    config["allowedImageTypes"] = [...fallback("allowedImageTypes")];
  }

  // Timings must be non-negative numbers. 0 turns an animation off and keeps
  // the shortcuts panel open. A notice has no close button, so it needs 1 ms
  // or more.
  ["helpTimeout", "zoomAnimationDuration", "panAnimationDuration"].forEach((key) =>
    checkNumber(key, 0, Infinity),
  );
  ["toastDuration", "errorToastDuration"].forEach((key) => checkNumber(key, 1, Infinity));
}
