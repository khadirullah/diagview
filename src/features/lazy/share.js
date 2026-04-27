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
import { showSuccessToast, showErrorToast } from "../../ui/toast.js";

/**
 * Manages view state persistence across the diagram lifecycle.
 * Uses a WeakMap to automatically clean up memory when diagrams are removed from the DOM.
 * @private
 */
const shareStates = new WeakMap();

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

    const ctm = svg.getScreenCTM();
    if (!ctm) return null;

    // Determine the exact geometric center of the visible viewport
    const vRect = viewport.getBoundingClientRect();
    const centerX = vRect.left + vRect.width / 2;
    const centerY = vRect.top + vRect.height / 2;

    // Use the Inverse Matrix to find the internal coordinate at that pixel location
    const pt = makeSVGPoint(svg, centerX, centerY);
    const svgPt = pt.matrixTransform(ctm.inverse());

    return { x: svgPt.x, y: svgPt.y };
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
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;

    const pt = makeSVGPoint(svg, svgX, svgY);
    const screenPt = pt.matrixTransform(ctm);

    return { x: screenPt.x, y: screenPt.y };
  } catch (e) {
    return null;
  }
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

  const url = new URL(window.location.href);

  // Strip existing parameters to ensure a clean link
  ["dv-idx", "dv-z", "dv-x", "dv-y", "dv-cx", "dv-cy", "dv-r", "dv-q"].forEach((p) =>
    url.searchParams.delete(p),
  );

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
  url.searchParams.set("dv-cx", Math.round(svgCenter.x));
  url.searchParams.set("dv-cy", Math.round(svgCenter.y));
  if (rotation !== 0) url.searchParams.set("dv-r", rotation);

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
      showSuccessToast("🔗 Share link copied!");
      return;
    } catch (err) {
      /* Silently fall back */
    }
  }

  // Legacy execCommand fallback
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

    shareStates.set(diagram, {
      scale: params.get("dv-z") ? parseFloat(params.get("dv-z")) : null,
      x: params.get("dv-x") ? parseInt(params.get("dv-x"), 10) : null,
      y: params.get("dv-y") ? parseInt(params.get("dv-y"), 10) : null,
      cx: params.get("dv-cx") ? parseInt(params.get("dv-cx"), 10) : null,
      cy: params.get("dv-cy") ? parseInt(params.get("dv-cy"), 10) : null,
      rotation: params.get("dv-r") ? parseInt(params.get("dv-r"), 10) : null,
      query: params.get("dv-q") || null,
    });

    return { diagram, index: idx };
  }

  return false;
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

  const { scale, x, y, cx, cy, rotation } = shareState;

  if (rotation !== null) state.rotationAngle = rotation;
  if (scale !== null) panzoom.zoom(scale, { animate: false });

  if (cx !== null && cy !== null) {
    // Wait for the browser to paint the new zoom layout
    requestAnimationFrame(() => {
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

        // Map pixel delta to Panzoom units based on active scale
        const currentScale = panzoom.getScale();

        // Rotation Correction:
        // Subtracting screen coordinates requires rotating the vector by the
        // diagram's rotation angle to find the correct pan offset.
        const angle = state.rotationAngle || 0;
        const rad = (-angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const finalX = (-screenDX / currentScale) * cos - (-screenDY / currentScale) * sin;
        const finalY = (-screenDX / currentScale) * sin + (-screenDY / currentScale) * cos;

        panzoom.pan(finalX, finalY, { animate: false, relative: true });
      } else if (x !== null && y !== null) {
        // Fallback to legacy raw pan
        panzoom.pan(x, y, { animate: false });
      }
    });
  } else if (x !== null && y !== null) {
    panzoom.pan(x, y, { animate: false });
  }

  shareStates.delete(diagram);
  return true;
}
