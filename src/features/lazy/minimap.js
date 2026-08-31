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

      // Map the click through the minimap SVG's own CTM to get exact viewBox
      // coordinates — this accounts for the snapshot's letterboxing inside
      // the minimap box and any CSS rotation, which rectangle arithmetic
      // (offset + width ratios) gets wrong.
      const mmCtm = state.minimapSvg.getScreenCTM();
      if (!mmCtm) return;
      const clickPt = state.minimapSvg.createSVGPoint();
      clickPt.x = e.clientX;
      clickPt.y = e.clientY;
      const target = clickPt.matrixTransform(mmCtm.inverse());
      const svgX = target.x;
      const svgY = target.y;

      const curScale = panzoom.getScale();

      // Pan so the clicked SVG point is centered in the viewport.
      // Use the CTM to find where that point currently sits on screen, then
      // pan by the remaining delta. Panzoom pan units are pre-scale pixels
      // and the SVG is letterboxed inside a 100%-sized box, so viewBox units
      // cannot simply be multiplied by the panzoom scale — the CTM accounts
      // for the base render scale, letterbox offsets, and transform-origin.
      const ctm = clone.getScreenCTM();
      if (!ctm) return;
      const pt = clone.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      const screenPt = pt.matrixTransform(ctm);

      const vpRect = viewport.getBoundingClientRect();
      const screenDX = screenPt.x - (vpRect.left + vpRect.width / 2);
      const screenDY = screenPt.y - (vpRect.top + vpRect.height / 2);

      // Rotate the screen delta into the SVG's local pan axes (the rotator
      // wrapper rotates the whole viewport content; pan happens pre-rotation).
      const angle = state.rotationAngle || 0;
      const rad = (-angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const panDX = (-screenDX / curScale) * cos - (-screenDY / curScale) * sin;
      const panDY = (-screenDX / curScale) * sin + (-screenDY / curScale) * cos;

      panzoom.pan(panDX, panDY, { animate: true, relative: true });
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

  // Position the viewport indicator by mapping the visible screen rect into
  // viewBox coordinates through the CTM — the same mapping the click handler
  // uses — then into the rendered minimap snapshot's pixel box. Deriving it
  // from pan/scale arithmetic instead drifts as zoom grows, because panzoom
  // pan units are pre-scale pixels of a letterboxed 100%-sized SVG, not
  // viewBox units.
  const minimapRect = minimap.getBoundingClientRect();
  const viewportIndicator = minimap.querySelector(".dv-mm-v");
  const ctm = clone.getScreenCTM();
  const mmSvgRect = state.minimapSvg.getBoundingClientRect();
  if (viewportIndicator && ctm && mmSvgRect.width > 0 && mmSvgRect.height > 0) {
    const inv = ctm.inverse();
    const toViewBox = (screenX, screenY) => {
      const p = clone.createSVGPoint();
      p.x = screenX;
      p.y = screenY;
      return p.matrixTransform(inv);
    };
    const p1 = toViewBox(viewportRect.left, viewportRect.top);
    const p2 = toViewBox(viewportRect.right, viewportRect.bottom);
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const minX = clamp(Math.min(p1.x, p2.x), d.width);
    const maxX = clamp(Math.max(p1.x, p2.x), d.width);
    const minY = clamp(Math.min(p1.y, p2.y), d.height);
    const maxY = clamp(Math.max(p1.y, p2.y), d.height);
    const px = (v) => (v / d.width) * mmSvgRect.width;
    const py = (v) => (v / d.height) * mmSvgRect.height;
    const left = mmSvgRect.left - minimapRect.left + px(minX);
    const top = mmSvgRect.top - minimapRect.top + py(minY);
    viewportIndicator.style.cssText = `left:${left}px;top:${top}px;width:${px(maxX - minX)}px;height:${py(maxY - minY)}px`;
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
