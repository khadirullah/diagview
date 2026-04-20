/**
 * DiagView Modal Controls
 * Shared modal control functions - prevents circular dependencies
 * @module ui/modal-controls
 */

import { state, runCleanupFunctions } from "../core/config.js";
import { safeDestroy } from "../core/lifecycle.js";
import { restoreFocus } from "./focus-manager.js";
import { cleanupModalHistoryState, stopVisualViewportSync } from "./viewport.js";

/**
 * Close fullscreen modal
 * Separated from modal.js to prevent circular dependency with keyboard.js
 */
export function closeModal() {
  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");
  const help = document.getElementById("diagview-help-modal");
  const menu = document.getElementById("diagview-temp-menu");

  // Stop visual viewport sync before teardown
  stopVisualViewportSync();

  // Clear search (lazy import to avoid circular dependency)
  import("../features/lazy/search.js").then((m) => m.clearSearch()).catch(() => {});

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
  ]).catch(() => {});

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
      document.exitFullscreen().catch(() => {});
    }
  }

  // Restore body scroll
  document.body.style.overflow = "";

  // Clean up history state (mobile back button support)
  cleanupModalHistoryState();

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

/**
 * Sync branding visibility based on current configuration
 * Reactive to runtime config changes
 */
export function syncBrandingVisibility() {
  const modal = document.getElementById("diagview-modal");
  const menu = document.getElementById("diagview-temp-menu");

  const elements = [modal, menu].filter((el) => !!el);
  if (elements.length === 0) return;

  const shouldHide = state.config.showBranding === false;

  elements.forEach((el) => {
    if (shouldHide) {
      el.classList.add("dv-hide-branding");
    } else {
      el.classList.remove("dv-hide-branding");
    }
  });
}
