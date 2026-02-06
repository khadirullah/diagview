/**
 * DiagView Modal Controls
 * Shared modal control functions - prevents circular dependencies
 * @module ui/modal-controls
 */

import { state, runCleanupFunctions } from "../core/config.js";
import { safeDestroy } from "../core/lifecycle.js";
import { restoreFocus } from "./focus-manager.js";

/**
 * Close fullscreen modal
 * Separated from modal.js to prevent circular dependency with keyboard.js
 */
export function closeModal() {
  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");
  const help = document.getElementById("diagview-help-modal");
  const menu = document.getElementById("diagview-temp-menu");

  // Clear search (lazy import to avoid circular dependency)
  import("../features/lazy/search.js")
    .then((m) => m.clearSearch())
    .catch(() => { });

  // Clear viewport
  if (viewport) {
    viewport.innerHTML = "";
  }

  // Hide keyboard help modal
  if (help) {
    help.classList.remove("show");
  }

  // Remove floating menu
  if (menu) {
    menu.remove();
  }

  // Cleanup features (lazy imports to avoid circular dependencies)
  Promise.all([
    import("../features/lazy/minimap.js").then((m) => m.cleanupMinimap()),
    import("../features/lazy/meeting-mode.js").then((m) => m.cleanupMeetingMode()),
    import("../features/lazy/rotate.js").then((m) => m.cleanupRotation()),
  ]).catch(() => { });

  // Destroy panzoom safely
  if (state.activePanzoom) {
    safeDestroy(state.activePanzoom, "destroy");
    state.activePanzoom = null;
  }

  // Run all cleanup functions (event listeners, etc.)
  runCleanupFunctions();

  // Reset touch state
  state.touchState = {
    isPinching: false,
    lastTouchCount: 0,
    initialDistance: 0,
  };

  // Reset modal state
  state.isModalOpen = false;

  // Close modal
  if (modal) {
    modal.classList.remove("open");

    // Exit fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  }

  // Restore body scroll
  document.body.style.overflow = "";

  // Restore focus
  restoreFocus();

  // Callback
  if (state.config.onClose) {
    try {
      state.config.onClose();
    } catch (e) {
      console.error("DiagView: onClose callback error:", e);
    }
  }
}
