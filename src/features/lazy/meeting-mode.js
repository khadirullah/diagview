/**
 * DiagView Meeting Mode
 * Laser pointer functionality for presentations
 * @module features/lazy/meeting-mode
 */

import { state, addCleanupFunction } from "../../core/config.js";
import { showSuccessToast } from "../../ui/toast.js";
import { addManagedListener } from "../../core/lifecycle.js";

/**
 * Enable meeting mode with laser pointer
 */
export function enableMeetingMode() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const laser = document.getElementById("diagview-laser");

  if (!viewport || !laser) return;

  state.meetingMode = true;
  viewport.classList.add("meeting");
  laser.style.display = "block";

  // Track mouse movement for laser pointer
  const handleMouseMove = (e) => {
    laser.style.left = e.clientX + "px";
    laser.style.top = e.clientY + "px";
  };

  // Use managed listener for auto-cleanup
  addManagedListener(viewport, "mousemove", handleMouseMove);

  // Store reference for manual cleanup if needed
  state.laserPointer = handleMouseMove;

  showSuccessToast("Meeting mode ON - Laser pointer active");
}

/**
 * Disable meeting mode
 */
export function disableMeetingMode() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const laser = document.getElementById("diagview-laser");

  if (!viewport || !laser) return;

  state.meetingMode = false;
  viewport.classList.remove("meeting");
  laser.style.display = "none";

  // Clear reference (actual cleanup handled by lifecycle manager)
  state.laserPointer = null;

  showSuccessToast("Meeting mode OFF");
}

/**
 * Toggle meeting mode
 */
export function toggleMeetingMode() {
  if (state.meetingMode) {
    disableMeetingMode();
  } else {
    enableMeetingMode();
  }

  // Update button state
  const btn = document.querySelector('[data-action="meeting"], #dv-meeting');
  if (btn) {
    btn.classList.toggle("active", state.meetingMode);
  }
}

/**
 * Cleanup meeting mode on modal close
 */
export function cleanupMeetingMode() {
  if (state.meetingMode) {
    disableMeetingMode();
  }
}
