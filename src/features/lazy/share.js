/**
 * DiagView Precision Sharing System
 *
 * THE GEOMETRY CHALLENGE:
 * Centering a specific node in a diagram is notoriously difficult because:
 * 1. Viewport sizes vary (mobile vs. ultra-wide).
 * 2. SVG viewBoxes can have arbitrary coordinate systems.
 * 3. Panzoom applies nested scaling and translation.
 * 4. Rotation adds trigonometric complexity.
 *
 * THE SOLUTION:
 * We bypass manual trigonometry by using the browser's native geometry engine.
 * By utilizing the SVG Current Transformation Matrix (CTM) and its Inverse, we
 * create a "Pixel-to-Internal" map that is 100% accurate regardless of zoom,
 * rotation, or layout shifts.
 *
 * @module features/lazy/share
 */

import { state } from "../../core/config.js";
import { loadChunk } from "../../core/lifecycle.js";
import { showSuccessToast, showErrorToast } from "../../ui/toast.js";
import { getClientCTM, copyText } from "../../core/utils.js";
import { setCanvasTheme } from "../../core/theme.js";
import { shareStates } from "../share-state.js";

// The page load reads share links before this chunk loads, so the parsing
// lives in share-state.js
export { getPendingShareState } from "../share-state.js";

/**
 * Creates a standard SVG Point object used for matrix transformation math.
 * @param {SVGSVGElement} svg - The context SVG element.
 * @param {number} x - Target screen X coordinate.
 * @param {number} y - Target screen Y coordinate.
 * @returns {SVGPoint} A new SVG point at the specified coordinates.
 * @private
 */
function makeSVGPoint(svg, x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  return pt;
}

/**
 * INVERSE MAPPING: Viewport -> SVG Internal
 * Identifies exactly which internal SVG coordinate is currently at the center
 * of the user's viewport.
 *
 * @param {HTMLElement} viewport - The modal container.
 * @param {SVGSVGElement} svg - The active SVG diagram.
 * @returns {{ x: number, y: number } | null} The internal SVG coordinates at the viewport center, or null if mapping fails.
 */
function getViewportCenterInSVGCoords(viewport, svg) {
  try {
    // Force a layout flush to ensure the CTM is up-to-date
    svg.getBoundingClientRect();

    // Client pixels, like the viewport rect below (see getClientCTM)
    const ctm = getClientCTM(svg);
    if (!ctm) return null;

    // Determine the exact geometric center of the visible viewport
    const vRect = viewport.getBoundingClientRect();
    const centerX = vRect.left + vRect.width / 2;
    const centerY = vRect.top + vRect.height / 2;

    // Use the Inverse Matrix to find the internal coordinate at that pixel location
    const pt = makeSVGPoint(svg, centerX, centerY);
    const svgPt = pt.matrixTransform(ctm.inverse());

    // Screen pixels per diagram unit at the current zoom, rotation included
    return { x: svgPt.x, y: svgPt.y, pxPerUnit: Math.hypot(ctm.a, ctm.b) };
  } catch (e) {
    console.error("DiagView: Geometry mapping failed", e);
    return null;
  }
}

/**
 * FORWARD MAPPING: SVG Internal -> Viewport
 * Calculates where a specific internal coordinate would appear on the user's
 * screen under the current zoom/rotation.
 *
 * @param {SVGSVGElement} svg - The active SVG diagram.
 * @param {number} svgX - Internal SVG X coordinate.
 * @param {number} svgY - Internal SVG Y coordinate.
 * @returns {{ x: number, y: number } | null} The screen-pixel coordinates of the internal point, or null if mapping fails.
 */
function getSVGPointInScreenCoords(svg, svgX, svgY) {
  try {
    const ctm = getClientCTM(svg);
    if (!ctm) return null;

    const pt = makeSVGPoint(svg, svgX, svgY);
    const screenPt = pt.matrixTransform(ctm);

    return { x: screenPt.x, y: screenPt.y };
  } catch (e) {
    return null;
  }
}

/**
 * Generates a high-precision shareable link for the current view.
 *
 * Strategically records:
 * 1. The precise internal point at the screen center (dv-cx, dv-cy).
 * 2. The high-precision zoom level (dv-z).
 * 3. Any active rotation (dv-r).
 *
 * @param {number} diagramIndex - Index of the diagram being shared.
 * @returns {string|null} The generated share URL, or null if generation fails.
 */
export function generateShareLink(diagramIndex) {
  if (!state.activePanzoom) return null;

  const viewport = document.getElementById("diagview-modal-viewport");
  const svg = viewport?.querySelector("svg");
  if (!viewport || !svg) return null;

  // Start from the page URL and drop its query and hash — never copy existing
  // params (avoids leaking auth tokens, session IDs, or other host-app parameters).
  // Built from href rather than origin + pathname because file:// pages report
  // the origin as the string "null", which made the URL constructor throw.
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  const scale = state.activePanzoom.getScale();
  const rotation = state.rotationAngle || 0;

  // Use the Matrix-based mapping for pixel-perfect coordinate capture
  const svgCenter = getViewportCenterInSVGCoords(viewport, svg);

  if (!svgCenter) {
    console.warn("DiagView: Failed to capture center coordinates");
    return null;
  }

  url.searchParams.set("dv-idx", diagramIndex);
  url.searchParams.set("dv-z", scale.toFixed(3));
  // Enough decimals that rounding moves the centre less than a quarter pixel
  // on screen. A diagram drawn in small units, or zoomed far in, needs more.
  const places = Math.min(6, Math.max(0, Math.ceil(Math.log10(svgCenter.pxPerUnit * 4))));
  url.searchParams.set("dv-cx", String(Number(svgCenter.x.toFixed(places))));
  url.searchParams.set("dv-cy", String(Number(svgCenter.y.toFixed(places))));
  if (rotation !== 0) url.searchParams.set("dv-r", rotation);

  // Add canvas theme parameters if customized
  if (state.activeCanvasThemeMode && state.activeCanvasThemeMode !== "auto") {
    url.searchParams.set("dv-t", state.activeCanvasThemeMode);
    if (state.activeCanvasThemeMode === "custom" && state.customCanvasColor) {
      url.searchParams.set("dv-c", state.customCanvasColor.replace("#", ""));
    }
  }

  // Add search query if active
  const searchInput = document.getElementById("diagview-search");
  const query = searchInput?.value?.trim();
  if (query) url.searchParams.set("dv-q", query);

  return url.toString();
}

/**
 * Copies the generated share link to the system clipboard.
 */
export async function shareLink(diagramIndex) {
  const link = generateShareLink(diagramIndex);

  if (!link) {
    showErrorToast("Cannot generate share link");
    return;
  }

  // Modern Async Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(link);
      showSuccessToast("Share link copied!");
      return;
    } catch (err) {
      /* Silently fall back */
    }
  }

  // Legacy execCommand fallback
  const previousFocus = document.activeElement;
  let copied = false;
  try {
    copied = copyText(link);
  } catch (error) {
    copied = false;
  } finally {
    // The hidden field took focus, so hand it back or keyboard shortcuts stop working
    if (previousFocus?.isConnected && previousFocus !== document.body) {
      previousFocus.focus?.({ preventScroll: true });
    }
  }

  if (copied) {
    showSuccessToast("Share link copied!");
  } else {
    showErrorToast("Failed to copy share link");
  }
}

/**
 * Reconstructs the saved view state in the modal.
 *
 * THE RESTORATION WORKFLOW:
 * 1. Apply Rotation.
 * 2. Apply Zoom (Resetting the pan state to a known centered baseline).
 * 3. Matrix Re-Sync:
 *    - Wait for one browser frame (requestAnimationFrame) for zoom to settle.
 *    - Find where the saved coordinate (cx, cy) is currently located on screen.
 *    - Pan the diagram by the pixel distance needed to return that point to the center.
 */
export function applyRestoredViewState(diagram, panzoom) {
  const shareState = shareStates.get(diagram);
  if (!shareState || !panzoom) return false;

  const { scale, x, y, cx, cy, rotation, themeMode, customColor } = shareState;

  if (themeMode) setCanvasTheme(themeMode, customColor);

  const applyZoomAndPan = () => {
    if (scale !== null) panzoom.zoom(scale, { animate: false });
    schedulePanRestore();
  };

  // Rotation must be APPLIED to the DOM, not just written to state — the
  // minimap renders from state.rotationAngle, so a bare state write shows a
  // rotated minimap over an unrotated diagram. applyRotationAngle rebuilds
  // the .dv-rot-g group and rewrites the viewBox exactly like pressing R,
  // which also puts the SVG's user space back in the same (rotated)
  // coordinate system the shared cx/cy were captured in.
  if (rotation !== null && rotation !== 0) {
    loadChunk("rotate", () => import("./rotate.js"))
      .then((m) => {
        if (state.isModalOpen) m.applyRotationAngle(rotation);
      })
      .catch(() => {})
      .then(applyZoomAndPan);
  } else {
    applyZoomAndPan();
  }

  function schedulePanRestore() {
    if (cx !== null && cy !== null) {
      // Panzoom's constructor schedules pan(startX, startY, {force: true}) on a
      // 0ms timer ("Wait for scale to update" in @panzoom/panzoom init). Any pan
      // applied before that timer fires is silently reset to (0,0) — scale is
      // kept, so the restored view lands on the diagram center instead of the
      // shared point. Queue our correction as a later macrotask so it wins.
      //
      // The correction converges over up to 3 frames: the modal layout can still
      // be settling on the first frame, which makes a single measurement fall
      // short. Each pass re-measures the on-screen error via the CTM and pans by
      // the remainder, stopping once the target sits within 1px of center.
      const MAX_CORRECTION_PASSES = 3;
      const correctToCenter = (pass) => {
        requestAnimationFrame(() => {
          if (!state.isModalOpen || state.activePanzoom !== panzoom) return;
          const viewport = document.getElementById("diagview-modal-viewport");
          const svg = viewport?.querySelector("svg");
          if (!svg || !panzoom) return;

          const screenPt = getSVGPointInScreenCoords(svg, cx, cy);

          if (screenPt) {
            const vRect = viewport.getBoundingClientRect();
            const vcx = vRect.left + vRect.width / 2;
            const vcy = vRect.top + vRect.height / 2;

            // Calculate the screen-pixel delta between current point and center
            const screenDX = screenPt.x - vcx;
            const screenDY = screenPt.y - vcy;

            if (Math.abs(screenDX) < 1 && Math.abs(screenDY) < 1) return;

            // Map pixel delta to Panzoom units based on active scale.
            // No rotation compensation: rotation lives on an inner SVG group
            // applied AFTER panzoom's scale/translate in the transform chain,
            // so pan always responds in raw screen axes (verified empirically
            // at 0/90/180/270).
            const currentScale = panzoom.getScale();

            panzoom.pan(-screenDX / currentScale, -screenDY / currentScale, {
              animate: false,
              relative: true,
            });
            if (pass + 1 < MAX_CORRECTION_PASSES) correctToCenter(pass + 1);
          } else if (x !== null && y !== null) {
            // Fallback to legacy raw pan
            panzoom.pan(x, y, { animate: false });
          }
        });
      };
      setTimeout(() => correctToCenter(0));
    } else if (x !== null && y !== null) {
      // Same deferral: outrun Panzoom's forced init pan (see comment above).
      setTimeout(() => {
        if (!state.isModalOpen || state.activePanzoom !== panzoom) return;
        panzoom.pan(x, y, { animate: false });
      });
    }
  }

  shareStates.delete(diagram);
  return true;
}
