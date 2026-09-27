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
 * Rotate diagram by 90 degrees
 * Architecture Fix: Rotates an inner <g> instead of the parent <div>.
 */
export function rotateDiagram() {
  if (!applyRotationAngle(state.rotationAngle + 90)) return;

  // Recalibrate panzoom so it recalculates bounds
  state.activePanzoom?.reset({ animate: true });

  showSuccessToast(`Rotated ${state.rotationAngle}°`);

  // Emit panzoomchange for minimap + zoom display sync
  const panzoomEl = state.activePanzoom?.elem;
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
