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

  // Get dimensions
  const d = {
    width: clone.width.baseVal.value || 800,
    height: clone.height.baseVal.value || 600,
  };

  const viewportRect = viewport.getBoundingClientRect();
  const scale = panzoom.getScale();
  const pan = panzoom.getPan();

  // Calculate if minimap is needed (diagram is larger than viewport)
  const needsMinimap =
    d.width * scale > viewportRect.width * 1.1 ||
    d.height * scale > viewportRect.height * 1.1;

  minimap.classList.toggle("show", needsMinimap);
  if (!needsMinimap) return;

  // Create minimap SVG if not exists
  if (!state.minimapSvg) {
    state.minimapSvg = clone.cloneNode(true);
    state.minimapSvg.style.cssText = "width:100%;height:100%";

    const viewport = minimap.querySelector(".dv-mm-v");
    minimap.insertBefore(state.minimapSvg, viewport);
  }

  // Calculate minimap scale
  const minimapRect = minimap.getBoundingClientRect();
  const minimapScale =
    Math.min(minimapRect.width / d.width, minimapRect.height / d.height) * 0.9;

  // Calculate viewport indicator position
  const vx =
    (-pan.x / scale + d.width / 2 - viewportRect.width / 2 / scale) *
    minimapScale;
  const vy =
    (-pan.y / scale + d.height / 2 - viewportRect.height / 2 / scale) *
    minimapScale;
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
