/**
 * DiagView Rotate Functionality
 * Rotate diagrams by 90 degrees
 * @module features/lazy/rotate
 */

import { state } from "../../core/config.js";
import { showSuccessToast } from "../../ui/toast.js";
import { centerSVGViewBox } from "../../core/utils.js";

/**
 * Apply a rotation angle to the modal diagram's DOM.
 * Extracted from rotateDiagram so view restores (share links, rememberZoom)
 * can apply a saved angle — writing state.rotationAngle alone rotates
 * nothing, which left the minimap rotated over an unrotated diagram.
 * @param {number} angle - 0, 90, 180, or 270
 * @returns {boolean} true if the rotation was applied to the DOM
 */
export function applyRotationAngle(angle) {
  state.rotationAngle = ((angle % 360) + 360) % 360;

  const rotator = document.getElementById("diagview-rotator");
  const svgEl = rotator?.querySelector("svg");

  if (!svgEl) return false;

  // Ensure an inner rotation group exists
  let rotGroup = svgEl.querySelector(":scope > g.dv-rot-g");
  if (!rotGroup) {
    rotGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rotGroup.classList.add("dv-rot-g");
    // Move ALL direct SVG children into the group
    while (svgEl.firstChild) rotGroup.appendChild(svgEl.firstChild);
    svgEl.appendChild(rotGroup);
  }

  // Rotate around the centre of the unrotated viewBox, captured on the first
  // turn. Re-measuring the bbox every turn grew the view by the 5% padding
  // each time on SVGs with width="100%" shapes, which size to the viewBox.
  const b = (svgEl._dvVb ||= (svgEl.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number));
  const [x, y = 0, w = 0, h = 0] = b;
  const cx = x + w / 2;
  const cy = y + h / 2;
  rotGroup.setAttribute("transform", `rotate(${state.rotationAngle}, ${cx}, ${cy})`);

  // Remove CSS rotation from the rotator div — SVG handles it now
  if (rotator) {
    rotator.style.transform = "translate(-50%, -50%)"; // No rotate()
    rotator.style.height = "100%";
  }

  // Fit the viewBox to the rotated box: same centre, sides swapped at 90/270
  if (w > 0 && h > 0) {
    const [vw, vh] = state.rotationAngle % 180 ? [h, w] : [w, h];
    svgEl.setAttribute("viewBox", `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
  } else {
    centerSVGViewBox(svgEl);
  }
  return true;
}

/**
 * The diagram content: the rotation group once one exists, else the SVG.
 * Its local coordinates are the unrotated diagram's either way.
 * @returns {SVGGraphicsElement|null} The content element, or null
 */
function contentRoot() {
  const svg = modalSvg();
  return svg?.querySelector(":scope > g.dv-rot-g") || svg;
}

/**
 * The modal diagram, which is also the element Panzoom moves.
 * @returns {SVGSVGElement|null} The SVG, or null
 */
function modalSvg() {
  return document.querySelector("#diagview-rotator svg");
}

/**
 * Map a screen point into an element's local coordinates, or back out.
 * @param {SVGGraphicsElement} el - Element whose screen CTM is used
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {boolean} [invert] - Map from screen into local space
 * @returns {number[]|null} [x, y], or null when there is no usable CTM
 */
function mapPoint(el, x, y, invert) {
  const m = el.getScreenCTM?.();
  if (!m) return null;
  if (!invert) return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const det = m.a * m.d - m.b * m.c;
  if (!det) return null;
  const dx = x - m.e;
  const dy = y - m.f;
  return [(m.d * dx - m.c * dy) / det, (m.a * dy - m.b * dx) / det];
}

/**
 * Write Panzoom's current pan and scale to the DOM now. Panzoom applies
 * them on the next frame, and a running transition shows a halfway value,
 * so without this a measurement can see an old view and a new viewBox can
 * paint one frame at the old pan.
 * @param {*} pz - Panzoom instance
 */
function applyTransformNow(pz) {
  const el = modalSvg();
  const opts = pz.getOptions?.();
  if (!el || typeof opts?.setTransform !== "function") return;
  el.style.transition = "none";
  opts.setTransform(el, { ...pz.getPan(), scale: pz.getScale() }, opts);
}

/**
 * The diagram point under the viewport centre, for rotateKeepsView.
 * @returns {{cx: number, cy: number, point: number[]}|null} Centre and point
 */
function viewCentre() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const root = contentRoot();
  if (!viewport || !root) return null;
  applyTransformNow(state.activePanzoom);
  const r = viewport.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const point = mapPoint(root, cx, cy, true);
  return point && { cx, cy, point, unit: screenUnit(root) };
}

/**
 * Screen pixels per diagram unit, from the element's screen CTM.
 * @param {SVGGraphicsElement} el - Element to measure
 * @returns {number} Pixels per unit, or 0 when there is no CTM
 */
function screenUnit(el) {
  const m = el.getScreenCTM?.();
  return m ? Math.hypot(m.a, m.b) : 0;
}

/**
 * Pan so the point that was under the viewport centre is back there, at the
 * same zoom scale.
 * @param {{cx: number, cy: number, point: number[]}} keep - From viewCentre()
 * @returns {boolean} False when the view could not be measured
 */
function keepView({ cx, cy, point, unit }) {
  const pz = state.activePanzoom;
  const root = contentRoot();
  // The rotated viewBox fits the viewport at a different size. Change the
  // zoom by that ratio so the diagram looks the same size after the turn.
  const after = root ? screenUnit(root) : 0;
  if (unit && after) {
    pz.zoom(pz.getScale() * (unit / after), { animate: false });
    applyTransformNow(pz);
  }
  const at = root && mapPoint(root, point[0], point[1]);
  if (!at) return false;
  const scale = pz.getScale();
  pz.pan((cx - at[0]) / scale, (cy - at[1]) / scale, { animate: false, relative: true });
  applyTransformNow(pz);
  return true;
}

/**
 * Rotate diagram by 90 degrees
 * Architecture Fix: Rotates an inner <g> instead of the parent <div>.
 */
export function rotateDiagram() {
  const keep = state.config.rotateKeepsView && state.activePanzoom ? viewCentre() : null;

  if (!applyRotationAngle(state.rotationAngle + 90)) return;

  if (!keep || !keepView(keep)) {
    // Recalibrate panzoom so it recalculates bounds
    state.activePanzoom?.reset({ animate: true });
  }

  showSuccessToast(`Rotated ${state.rotationAngle}°`);

  // Emit panzoomchange for minimap + zoom display sync. Panzoom has no
  // elem property, so only a kept view, whose pan may not change and so
  // may fire no event of its own, finds the element.
  const panzoomEl = keep ? modalSvg() : state.activePanzoom?.elem;
  if (panzoomEl) {
    panzoomEl.dispatchEvent(
      new CustomEvent("panzoomchange", {
        detail: { scale: state.activePanzoom.getScale(), isRotation: true },
      }),
    );
  }

  // Save state
  const diagrams = document.querySelectorAll(state.config.diagramSelector);
  const active = diagrams[state.currentDiagramIndex];
  if (active?.dataset?.diagviewId) {
    import("../panzoom-integration.js").then((m) =>
      m.saveZoomState(active.dataset.diagviewId, state.activePanzoom),
    );
  }
}

/**
 * Reset rotation
 */
export function resetRotation() {
  state.rotationAngle = 0;
  cleanupRotation();

  const svgEl = document.querySelector("#diagview-modal-viewport svg");
  if (svgEl?._dvVb) {
    svgEl.setAttribute("viewBox", svgEl._dvVb.join(" "));
  } else if (svgEl) {
    centerSVGViewBox(svgEl);
  }

  if (state.activePanzoom) {
    state.activePanzoom.reset({ animate: true });
  }
}

/**
 * Cleanup rotation on modal close
 * Architecture Fix: Unwraps the inner rotation group wrapper.
 */
export function cleanupRotation() {
  state.rotationAngle = 0;
  // Remove the inner rotation group wrapper if it was created
  const svgEl = document.querySelector("#diagview-modal-viewport svg");
  const rotGroup = svgEl?.querySelector(":scope > g.dv-rot-g");
  if (rotGroup && svgEl) {
    while (rotGroup.firstChild) svgEl.insertBefore(rotGroup.firstChild, rotGroup);
    rotGroup.remove();
  }
}
