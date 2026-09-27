/**
 * DiagView Canvas Grid
 * Dot grid behind the fullscreen diagram. It is a CSS background on the
 * viewport, never part of the SVG, so exports cannot pick it up.
 * @module ui/canvas-grid
 */

import { state } from "../core/config.js";

/** Dot spacing in CSS pixels at 100% zoom */
const GRID_SPACING = 24;

/**
 * Point the grid at the diagram's current pan and zoom. The spacing doubles
 * or halves to stay between 16 and 32 pixels, so the dots never crowd into
 * a grey wash when zoomed out or thin out to nothing when zoomed in.
 * @param {HTMLElement} viewport - Modal viewport
 * @param {{x?: number, y?: number, scale?: number}} [detail] - Panzoom values
 */
export function updateCanvasGrid(viewport, detail) {
  const pz = state.activePanzoom;
  if (!viewport?.classList.contains("dv-grid-dots") || !pz) return;

  const scale = detail?.scale ?? pz.getScale();
  const pan = typeof detail?.x === "number" ? detail : pz.getPan();
  const size = GRID_SPACING * scale * 2 ** -Math.floor(Math.log2((GRID_SPACING * scale) / 16));

  // Panzoom scales about the diagram's centre, which sits at the viewport
  // centre, so a dot at the centre moves by the scaled pan
  const s = viewport.style;
  s.setProperty("--dv-grid-size", `${size}px`);
  s.setProperty("--dv-grid-x", `${pan.x * scale}px`);
  s.setProperty("--dv-grid-y", `${pan.y * scale}px`);

  // Follow a zoom button or reset while the diagram animates to it
  const t = viewport.querySelector("svg")?.style.transition || "";
  s.transition =
    t && t !== "none"
      ? `background-size${t.replace(/^\S+/, "")}, background-position${t.replace(/^\S+/, "")}`
      : "";
}

/**
 * Show or hide the grid for the current canvasGrid setting.
 */
export function syncCanvasGrid() {
  const viewport = document.getElementById("diagview-modal-viewport");
  if (!viewport) return;
  const on = state.config.canvasGrid === "dots";
  viewport.classList.toggle("dv-grid-dots", on);
  if (on) {
    updateCanvasGrid(viewport);
  } else {
    ["--dv-grid-size", "--dv-grid-x", "--dv-grid-y", "transition"].forEach((p) =>
      viewport.style.removeProperty(p),
    );
  }
}
