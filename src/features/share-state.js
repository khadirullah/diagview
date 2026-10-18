/**
 * Share link parsing. The page load checks the address for a share link,
 * so this part is in the main bundle. Making and applying links is in the
 * lazy share chunk.
 * @module features/share-state
 */

import { ZOOM } from "../core/constants.js";

/**
 * Manages view state persistence across the diagram lifecycle.
 * Uses a WeakMap to automatically clean up memory when diagrams are removed from the DOM.
 * The share chunk reads and clears it when it applies the view.
 */
export const shareStates = new WeakMap();

/**
 * Clamp a numeric value to a safe range.
 * @param {number} val - Value to clamp.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Clamped value.
 * @private
 */
function clampNum(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Returns the pending share state for a diagram, if any.
 * @param {HTMLElement} diagram - The diagram element.
 * @returns {object|null} The pending share state or null.
 */
export function getPendingShareState(diagram) {
  return shareStates.get(diagram) || null;
}

/**
 * Detects and parses shared state from the URL.
 * @returns {object|boolean} The restored diagram and its index, or false if no state found.
 */
export function restoreViewFromURL(diagrams) {
  const params = new URLSearchParams(window.location.search);
  const dvIdx = params.get("dv-idx");

  if (dvIdx === null) return false;

  const idx = parseInt(dvIdx, 10);
  if (idx >= 0 && idx < diagrams.length) {
    const diagram = diagrams[idx];

    // Clamp all numeric params to safe ranges before trusting them.
    // Prevents crafted URLs from passing extreme values to panzoom/DOM ops.
    const rawScale = params.get("dv-z") ? parseFloat(params.get("dv-z")) : null;
    const rawCx = params.get("dv-cx") ? parseFloat(params.get("dv-cx")) : null;
    const rawCy = params.get("dv-cy") ? parseFloat(params.get("dv-cy")) : null;
    const rawX = params.get("dv-x") ? parseInt(params.get("dv-x"), 10) : null;
    const rawY = params.get("dv-y") ? parseInt(params.get("dv-y"), 10) : null;
    const rawRot = params.get("dv-r") ? parseInt(params.get("dv-r"), 10) : null;

    const rawTheme = params.get("dv-t");
    const rawColor = params.get("dv-c");
    const VALID_THEME_MODES = new Set(["light", "dark", "auto", "custom"]);
    const themeMode = rawTheme && VALID_THEME_MODES.has(rawTheme) ? rawTheme : null;
    // Hex colours are 3, 4, 6 or 8 digits; 5 or 7 digits is not a colour
    const customColor =
      rawColor && /^(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(rawColor)
        ? `#${rawColor}`
        : null;

    const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

    shareStates.set(diagram, {
      scale:
        rawScale !== null && isFinite(rawScale)
          ? clampNum(rawScale, ZOOM.MIN_SCALE_LIMIT, ZOOM.MAX_SCALE_LIMIT)
          : null,
      x: rawX !== null && isFinite(rawX) ? clampNum(rawX, -100000, 100000) : null,
      y: rawY !== null && isFinite(rawY) ? clampNum(rawY, -100000, 100000) : null,
      cx: rawCx !== null && isFinite(rawCx) ? clampNum(rawCx, -100000, 100000) : null,
      cy: rawCy !== null && isFinite(rawCy) ? clampNum(rawCy, -100000, 100000) : null,
      rotation: rawRot !== null && VALID_ROTATIONS.has(rawRot) ? rawRot : null,
      // A label is far shorter, and a crafted link should not fill the box
      query: params.get("dv-q")?.slice(0, 200) || null,
      themeMode,
      customColor,
    });

    return { diagram, index: idx };
  }

  return false;
}
