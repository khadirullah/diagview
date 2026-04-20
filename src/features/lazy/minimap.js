/**
 * DiagView Minimap Functionality
 * Provides overview navigation for large diagrams
 * @module features/lazy/minimap
 */

import { state } from "../../core/config.js";

/**
 * Update minimap viewport indicator
 */
export function updateMinimap(clone, viewport, panzoom) {
  const minimap = document.getElementById("diagview-minimap");
  if (!minimap || !clone || !viewport || !panzoom) return;

  // Use getBoundingClientRect for BOTH SVG and viewport — same CSS pixel
  // coordinate space. GBCR includes CSS transforms (panzoom scale) and is
  // automatically adjusted by browser zoom. This eliminates the old bug where
  // baseVal (SVG intrinsic units) was compared against CSS pixels, causing
  // false-positive minimap visibility at high browser zoom levels.
  const svgRect = clone.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const scale = panzoom.getScale();
  const pan = panzoom.getPan();

  // Minimap needed when the scaled diagram exceeds the viewport.
  // Both values in same CSS pixel space — browser zoom has zero effect.
  const needsMinimap =
    svgRect.width > viewportRect.width * 1.05 || svgRect.height > viewportRect.height * 1.05;

  minimap.classList.toggle("show", needsMinimap);
  if (!needsMinimap) return;

  // Get intrinsic SVG dimensions for minimap scale calculation.
  // Prefer viewBox (SVG's own coordinate system, zoom-independent).
  // Fallback to computed dimensions divided by panzoom scale.
  const viewBox = clone.viewBox?.baseVal;
  const d = {
    width: viewBox?.width || svgRect.width / scale || 800,
    height: viewBox?.height || svgRect.height / scale || 600,
  };

  // Create minimap SVG if not exists
  if (!state.minimapSvg) {
    state.minimapSvg = clone.cloneNode(true);
    state.minimapSvg.style.cssText =
      "max-width:100%; max-height:100%; width:auto; height:auto; display:block; object-fit:contain; transform:none !important;";

    if (!state.minimapSvg.getAttribute("viewBox") && d.width && d.height) {
      state.minimapSvg.setAttribute("viewBox", `0 0 ${d.width} ${d.height}`);
    }
    state.minimapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    state.minimapSvg.removeAttribute("width");
    state.minimapSvg.removeAttribute("height");

    // FIX: renamed to 'mmIndicator' to avoid shadowing the 'viewport' parameter
    const mmIndicator = minimap.querySelector(".dv-mm-v");
    minimap.insertBefore(state.minimapSvg, mmIndicator);
  }

  // Calculate minimap scale
  const minimapRect = minimap.getBoundingClientRect();
  const minimapScale = Math.min(minimapRect.width / d.width, minimapRect.height / d.height) * 0.9;

  // Calculate viewport indicator position
  const vx = (-pan.x / scale + d.width / 2 - viewportRect.width / 2 / scale) * minimapScale;
  const vy = (-pan.y / scale + d.height / 2 - viewportRect.height / 2 / scale) * minimapScale;
  const vw = (viewportRect.width / scale) * minimapScale;
  const vh = (viewportRect.height / scale) * minimapScale;

  // Center offset
  const ox = (minimapRect.width - d.width * minimapScale) / 2;
  const oy = (minimapRect.height - d.height * minimapScale) / 2;

  // Update viewport indicator
  const viewportIndicator = minimap.querySelector(".dv-mm-v");
  if (viewportIndicator) {
    viewportIndicator.style.cssText = `left:${ox + vx}px;top:${oy + vy}px;width:${vw}px;height:${vh}px`;
  }
}

/**
 * Show minimap
 */
export function showMinimap() {
  const minimap = document.getElementById("diagview-minimap");
  if (minimap) {
    minimap.classList.add("show");
  }
}

/**
 * Hide minimap
 */
export function hideMinimap() {
  const minimap = document.getElementById("diagview-minimap");
  if (minimap) {
    minimap.classList.remove("show");
    // Clear minimap SVG reference
    if (state.minimapSvg) {
      state.minimapSvg.remove();
      state.minimapSvg = null;
    }
  }
}

/**
 * Cleanup minimap
 */
export function cleanupMinimap() {
  hideMinimap();
}
