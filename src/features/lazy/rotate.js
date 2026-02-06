/**
 * DiagView Rotate Functionality
 * Rotate diagrams by 90 degrees
 * @module features/lazy/rotate
 */

import { state } from "../../core/config.js";
import { showSuccessToast } from "../../ui/toast.js";

/**
 * Rotate diagram by 90 degrees
 */
export function rotateDiagram() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (!clone) return;

  // Increment rotation by 90 degrees
  state.rotationAngle = (state.rotationAngle + 90) % 360;

  // Apply rotation transform
  clone.style.transform = `rotate(${state.rotationAngle}deg)`;

  showSuccessToast(`↻ Rotated ${state.rotationAngle}°`);
}

/**
 * Reset rotation
 */
export function resetRotation() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (!clone) return;

  state.rotationAngle = 0;
  clone.style.transform = "";
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
