/**
 * DiagView Rotate Functionality
 * Rotate diagrams by 90 degrees
 * @module features/lazy/rotate
 */

import { state } from "../../core/config.js";
import { showSuccessToast } from "../../ui/toast.js";
import { centerSVGViewBox } from "../../core/utils.js";

/**
 * Rotate diagram by 90 degrees
 * Architecture Fix: Rotates an inner <g> instead of the parent <div>.
 */
export function rotateDiagram() {
  state.rotationAngle = (state.rotationAngle + 90) % 360;

  const rotator = document.getElementById("diagview-rotator");
  const svgEl = rotator?.querySelector("svg");

  if (!svgEl) return;

  // Ensure an inner rotation group exists
  let rotGroup = svgEl.querySelector(":scope > g.dv-rot-g");
  if (!rotGroup) {
    rotGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rotGroup.classList.add("dv-rot-g");
    // Move ALL direct SVG children into the group
    while (svgEl.firstChild) rotGroup.appendChild(svgEl.firstChild);
    svgEl.appendChild(rotGroup);
  }

  // Rotate around the SVG content center (viewBox midpoint)
  const vb = svgEl.viewBox?.baseVal;
  const cx = vb ? vb.x + vb.width / 2 : 0;
  const cy = vb ? vb.y + vb.height / 2 : 0;
  rotGroup.setAttribute("transform", `rotate(${state.rotationAngle}, ${cx}, ${cy})`);

  // Remove CSS rotation from the rotator div — SVG handles it now
  if (rotator) {
    rotator.style.transform = "translate(-50%, -50%)"; // No rotate()
    rotator.style.height = "100%";
  }

  // RE-CENTER: Update the viewBox to match the new rotated bounds.
  // This prevents the diagram from being clipped by the original viewBox.
  centerSVGViewBox(svgEl);

  // Recalibrate panzoom so it recalculates bounds
  state.activePanzoom?.reset({ animate: true });

  showSuccessToast(`↻ Rotated ${state.rotationAngle}°`);

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
  if (svgEl) {
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
