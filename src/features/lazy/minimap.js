/**
 * DiagView Minimap Functionality
 * Provides overview navigation for large diagrams
 * @module features/lazy/minimap
 */

import { state } from "../../core/config.js";
import { addModalListener } from "../../core/lifecycle.js";

// Stores the cleanup fn for the minimap click handler so it can be
// removed on modal close without duplicating handlers across frames
let _minimapClickCleanup = null;

/**
 * Update minimap viewport indicator
 */
export function updateMinimap(clone, viewport, panzoom) {
  const minimap = document.getElementById("diagview-minimap");
  if (!minimap || !clone || !viewport || !panzoom || !state.config.showMinimap) {
    if (minimap) minimap.classList.remove("show");
    return;
  }

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

  // Create minimap SVG if not exists, or if the previous one was detached
  // (can happen if cleanupMinimap() was skipped on an error path)
  if (!state.minimapSvg?.isConnected) {
    if (state.minimapSvg) {
      state.minimapSvg.remove();
      state.minimapSvg = null;
    }

    // DOM-3: Instead of deep-cloning thousands of nodes, we use a lightweight <use> element.
    // This allows the browser to re-use the graphics of the original SVG without the
    // overhead of creating a second massive DOM tree in the JavaScript heap.
    state.minimapSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    // We must reference the ORIGINAL untransformed SVG from the page.
    // If we reference the 'clone', the minimap will zoom/pan along with it (Regression).
    const originalContainer = state.activeSourceElement;

    if (!originalContainer) {
      console.warn("DiagView: No active source element for minimap source");
      return;
    }
    const originalSvg = originalContainer?.querySelector("svg");

    if (!originalSvg) {
      console.warn("DiagView: Original SVG not found for minimap source");
      return;
    }

    // BUG-16 Fix: Use a Data URL snapshot to avoid mutating the original SVG's ID.
    // This ensures isolation and prevents breaking host-page CSS/JS.
    const snapshot = new XMLSerializer().serializeToString(originalSvg);
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(snapshot);

    const imgEl = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imgEl.setAttribute("href", dataUrl);
    imgEl.setAttribute("x", "0");
    imgEl.setAttribute("y", "0");
    imgEl.setAttribute("width", "100%");
    imgEl.setAttribute("height", "100%");
    imgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    state.minimapSvg.appendChild(imgEl);

    state.minimapSvg.style.cssText = `max-width:100%; max-height:100%; width:auto; height:auto; display:block; object-fit:contain; transform:rotate(${state.rotationAngle}deg);`;

    if (!state.minimapSvg.getAttribute("viewBox") && d.width && d.height) {
      state.minimapSvg.setAttribute("viewBox", `0 0 ${d.width} ${d.height}`);
    }
    state.minimapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    state.minimapSvg.removeAttribute("width");
    state.minimapSvg.removeAttribute("height");

    const mmIndicator = minimap.querySelector(".dv-mm-v");
    minimap.insertBefore(state.minimapSvg, mmIndicator);
  }

  // Attach click-to-navigate handler once per minimap lifetime (A7)
  // Guard prevents duplicate listeners across updateMinimap calls
  if (!_minimapClickCleanup) {
    const handleMinimapClick = (e) => {
      if (!panzoom || !state.minimapSvg) return;

      const mmRect = minimap.getBoundingClientRect();
      const mmSvgRect = state.minimapSvg.getBoundingClientRect();

      // Get click position relative to the minimap container
      const clickX = e.clientX - mmRect.left;
      const clickY = e.clientY - mmRect.top;

      // Get actual rendered offsets of the SVG within the container (accounts for object-fit)
      const offsetX = mmSvgRect.left - mmRect.left;
      const offsetY = mmSvgRect.top - mmRect.top;

      // Recalculate current geometry
      const curScale = panzoom.getScale();
      const curViewBox = clone.viewBox?.baseVal;
      const curD = {
        width: curViewBox?.width || clone.getBoundingClientRect().width / curScale || 800,
        height: curViewBox?.height || clone.getBoundingClientRect().height / curScale || 600,
      };

      // Map click (adjusted for offset) to SVG coordinate space
      const relX = clickX - offsetX;
      const relY = clickY - offsetY;

      // Use actual rendered dimensions for scaling
      const svgX = relX * (curD.width / mmSvgRect.width);
      const svgY = relY * (curD.height / mmSvgRect.height);

      // Pan so the clicked SVG point is centered in the viewport
      const vpRect = viewport.getBoundingClientRect();
      const targetPanX = -(svgX * curScale - vpRect.width / 2);
      const targetPanY = -(svgY * curScale - vpRect.height / 2);

      panzoom.pan(targetPanX, targetPanY, { animate: true });
    };

    // MAJ-6: Use a self-resetting cleanup wrapper. This ensures the module-level
    // variable is nulled out even if the cleanup is triggered externally by
    // runModalCleanupFunctions during modal closure.
    const cleanup = addModalListener(minimap, "click", handleMinimapClick);
    _minimapClickCleanup = () => {
      if (typeof cleanup === "function") cleanup();
      _minimapClickCleanup = null;
    };

    // Make minimap visually indicate it's clickable
    minimap.style.cursor = "crosshair";
  }

  // Update minimap rotation if it changed
  if (state.minimapSvg.style.transform !== `rotate(${state.rotationAngle}deg)`) {
    state.minimapSvg.style.transform = `rotate(${state.rotationAngle}deg)`;
  }

  // Calculate minimap scale
  const minimapRect = minimap.getBoundingClientRect();
  const minimapScale = Math.min(minimapRect.width / d.width, minimapRect.height / d.height) * 0.9;

  // Calculate viewport indicator position
  // We use the actual pan values from panzoom — these already reflect the
  // correct physical offset regardless of the naturalPanning setting.
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
  // Clear click handler reference so next modal open re-attaches fresh
  _minimapClickCleanup = null;
}
