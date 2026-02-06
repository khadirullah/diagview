/**
 * DiagView Share Functionality
 * Generate shareable links with view state
 * @module features/lazy/share
 */

import { state } from "../../core/config.js";
import { showSuccessToast, showErrorToast } from "../../ui/toast.js";

/**
 * Generate share link with current view state
 */
export function generateShareLink(diagramIndex) {
  if (!state.activePanzoom) return null;

  const url = new URL(window.location.href);

  // Clear any existing dv params
  url.searchParams.delete("dv-idx");
  url.searchParams.delete("dv-z");
  url.searchParams.delete("dv-x");
  url.searchParams.delete("dv-y");

  // Add current state
  const scale = state.activePanzoom.getScale();
  const pan = state.activePanzoom.getPan();

  url.searchParams.set("dv-idx", diagramIndex);
  url.searchParams.set("dv-z", scale.toFixed(3));
  url.searchParams.set("dv-x", Math.round(pan.x));
  url.searchParams.set("dv-y", Math.round(pan.y));

  return url.toString();
}

/**
 * Copy share link to clipboard
 */
export async function shareLink(diagramIndex) {
  const link = generateShareLink(diagramIndex);

  if (!link) {
    showErrorToast("Cannot generate share link");
    return;
  }

  // Try modern clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(link);
      showSuccessToast("🔗 Share link copied!");
      return;
    } catch (error) {
      // Fall through to fallback
    }
  }

  // Fallback for non-secure contexts
  try {
    const input = document.createElement("input");
    input.value = link;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showSuccessToast("🔗 Share link copied!");
  } catch (error) {
    showErrorToast("Failed to copy share link");
  }
}

/**
 * Restore view state from URL parameters
 */
export function restoreViewFromURL(diagrams) {
  const params = new URLSearchParams(window.location.search);
  const dvIdx = params.get("dv-idx");
  const dvZ = params.get("dv-z");
  const dvX = params.get("dv-x");
  const dvY = params.get("dv-y");

  if (dvIdx === null) return false;

  const idx = parseInt(dvIdx, 10);
  if (idx >= 0 && idx < diagrams.length) {
    const diagram = diagrams[idx];

    // Store view state to restore after modal opens
    diagram._shareState = {
      scale: dvZ ? parseFloat(dvZ) : null,
      x: dvX ? parseInt(dvX, 10) : null,
      y: dvY ? parseInt(dvY, 10) : null,
    };

    return { diagram, index: idx };
  }

  return false;
}

/**
 * Apply restored view state
 * @returns {boolean} True if state was applied
 */
export function applyRestoredViewState(diagram, panzoom) {
  if (!diagram._shareState || !panzoom) return false;

  const { scale, x, y } = diagram._shareState;

  // Apply zoom
  if (scale !== null) {
    panzoom.zoom(scale, { animate: false });
  }

  // Apply pan
  if (x !== null && y !== null) {
    panzoom.pan(x, y, { animate: false });
  }

  // Clear state
  delete diagram._shareState;
  return true;
}
