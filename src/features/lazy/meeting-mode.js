/**
 * DiagView Meeting Mode
 * Laser pointer functionality for presentations
 * @module features/lazy/meeting-mode
 */

import { state } from "../../core/config.js";
import { addModalCleanupFunction } from "../../core/lifecycle.js";
import { showSuccessToast } from "../../ui/toast.js";

// Meeting Handlers state handled via state.activeMeetingHandlers in config.js

// Guard: ensures addModalCleanupFunction is called at most once per modal session.
// Reset in resetMeetingState() when destroy() tears down the modal.
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
    // SEC-7: We must multiply by visualViewport.scale because the modal
    // is counter-scaled by (1 / scale). This ensures the laser pointer
    // matches the actual screen position even when background is zoomed.
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    const x = e.clientX * scale;
    const y = e.clientY * scale;

    // OPT-5: Use transform instead of top/left to avoid layout thrashing
    laser.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  // Track touch movement for mobile support
  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      const scale = window.visualViewport ? window.visualViewport.scale : 1;
      const x = e.touches[0].clientX * scale;
      const y = e.touches[0].clientY * scale;
      laser.style.transform = `translate3d(${x}px, ${y}px, 0)`;
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
  if (!state.meetingCleanupRegistered) {
    state.meetingCleanupRegistered = true;
    addModalCleanupFunction(() => {
      disableMeetingMode(true); // silent cleanup
      state.meetingCleanupRegistered = false; // reset for next modal open
    });
  }

  state.laserPointer = handleMouseMove;
  showSuccessToast("Meeting mode ON - Laser pointer active");
}

/**
 * Disable meeting mode
 */
export function disableMeetingMode(silent = false) {
  const viewport =
    state.activeMeetingHandlers?.viewport || document.getElementById("diagview-modal-viewport");
  const laser = document.getElementById("diagview-laser");

  if (state.activeMeetingHandlers && viewport) {
    viewport.removeEventListener("mousemove", state.activeMeetingHandlers.mousemove);
    viewport.removeEventListener("touchmove", state.activeMeetingHandlers.touchmove);
    state.activeMeetingHandlers = null;
  } else if (state.activeMeetingHandlers) {
    // Handlers exist but viewport is gone - just clear the handlers ref
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

  // Update button visual + ARIA state
  const btn = document.querySelector('[data-action="meeting"], #dv-meeting');
  if (btn) {
    btn.classList.toggle("active", state.meetingMode);
    btn.setAttribute("aria-pressed", state.meetingMode ? "true" : "false");
  }
}

/**
 * Reset module-level state for destroy/re-init cycles
 * Called by index.js destroy()
 */
export function resetMeetingState() {
  state.activeMeetingHandlers = null;
  state.meetingCleanupRegistered = false;
}
