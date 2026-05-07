import { ZOOM, LAYOUTS, EXPORT } from "./constants.js";
import { DEFAULT_CONFIG } from "./config-defaults.js";

/**
 * Validate entire configuration
 * @param {Record<string, *>} config - The config object to validate
 */
export function validateConfig(config) {
  const defaults = /** @type {Record<string, *>} */ (DEFAULT_CONFIG);

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
