/**
 * DiagView Rotate Functionality
 * Rotate diagrams by 90 degrees
 * @module features/lazy/rotate
 */

import { state } from "../../core/config.js";
import { showSuccessToast } from "../../ui/toast.js";
import { refreshPanzoom, saveZoomState } from "../panzoom-integration.js";

/**
 * Rotate diagram by 90 degrees
 */
export function rotateDiagram() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (!clone || !state.activePanzoom) return;

  const panzoom = state.activePanzoom;

  // Increment rotation by 90 degrees
  state.rotationAngle = (state.rotationAngle + 90) % 360;

  // Trigger a direct transform refresh (The proper way to handle external state changes)
  refreshPanzoom(panzoom);

  // Save state if enabled
  const diagrams = document.querySelectorAll(state.config.diagramSelector);
  const activeDiagram = diagrams[state.currentDiagramIndex];
  if (activeDiagram?.dataset?.diagviewId) {
    saveZoomState(activeDiagram.dataset.diagviewId, panzoom);
  }

  showSuccessToast(`↻ Rotated ${state.rotationAngle}°`);
}

/**
 * Reset rotation
 */
export function resetRotation() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (!clone || !state.activePanzoom) return;

  const panzoom = state.activePanzoom;
  state.rotationAngle = 0;

  // Reset via Panzoom (which will pick up the 0 angle in setTransform)
  panzoom.reset({ animate: true });

  // Save state
  const diagrams = document.querySelectorAll(state.config.diagramSelector);
  const activeDiagram = diagrams[state.currentDiagramIndex];
  if (activeDiagram?.dataset?.diagviewId) {
    saveZoomState(activeDiagram.dataset.diagviewId, panzoom);
  }
}

/**
 * Get current rotation angle
 */
export function getRotationAngle() {
  return state.rotationAngle;
}

/**
 * Cleanup rotation on modal close
 */
export function cleanupRotation() {
  state.rotationAngle = 0;
}
