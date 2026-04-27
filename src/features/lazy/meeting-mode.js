/**
 * DiagView Meeting Mode
 * Laser pointer functionality for presentations
 * @module features/lazy/meeting-mode
 */

import { state } from "../../core/config.js";
import { addModalCleanupFunction } from "../../core/lifecycle.js";
import { showSuccessToast } from "../../ui/toast.js";

// Meeting Handlers state handled via state.activeMeetingHandlers in config.js

/**
 * Enable meeting mode with laser pointer
 */
export function enableMeetingMode() {
  const viewport = document.getElementById("diagview-modal-viewport");
  const laser = document.getElementById("diagview-laser");

  if (!viewport || !laser || state.meetingMode) return;

  state.meetingMode = true;
  viewport.classList.add("meeting");
  laser.style.display = "block";

  // Track mouse movement for laser pointer
  const handleMouseMove = (e) => {
    laser.style.left = e.clientX + "px";
    laser.style.top = e.clientY + "px";
  };

  // Track touch movement for mobile support
  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      laser.style.left = e.touches[0].clientX + "px";
      laser.style.top = e.touches[0].clientY + "px";
    }
  };

  viewport.addEventListener("mousemove", handleMouseMove);
  viewport.addEventListener("touchmove", handleTouchMove, { passive: true });

  // Store references for removal
  state.activeMeetingHandlers = {
    mousemove: handleMouseMove,
    touchmove: handleTouchMove,
    viewport: viewport, // Store viewport ref in case it changes (unlikely but safe)
  };

  // Register cleanup with modal lifecycle (one-time registration)
  addModalCleanupFunction(() => {
    disableMeetingMode(true); // silent cleanup
  });

  state.laserPointer = handleMouseMove;
  showSuccessToast("Meeting mode ON - Laser pointer active");
}

/**
 * Disable meeting mode
 */
export function disableMeetingMode(silent = false) {
  const viewport = state.activeMeetingHandlers?.viewport || document.getElementById("diagview-modal-viewport");
  const laser = document.getElementById("diagview-laser");

  if (state.activeMeetingHandlers) {
    viewport.removeEventListener("mousemove", state.activeMeetingHandlers.mousemove);
    viewport.removeEventListener("touchmove", state.activeMeetingHandlers.touchmove);
    state.activeMeetingHandlers = null;
  }

  state.meetingMode = false;
  state.laserPointer = null;

  if (viewport) viewport.classList.remove("meeting");
  if (laser) laser.style.display = "none";

  if (!silent) showSuccessToast("Meeting mode OFF");
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
 * Reset module-level state for destroy/re-init cycles
 * Called by index.js destroy()
 */
export function resetMeetingState() {
  state.activeMeetingHandlers = null;
}
