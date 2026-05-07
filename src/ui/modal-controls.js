/**
 * DiagView Modal Controls
 * Shared modal control functions - prevents circular dependencies
 * @module ui/modal-controls
 */

import { state, runModalCleanupFunctions } from "../core/config.js";
import { safeDestroy, clearAsyncTasks } from "../core/lifecycle.js";
import { restoreFocus } from "./focus-manager.js";
import { cleanupModalHistoryState, stopVisualViewportSync } from "./viewport.js";
import { hideKeyboardHelp } from "./keyboard-help.js";
import { hideToast } from "./toast.js";

/**
 * Lock body scroll (iOS Safari robust version)
 */
export function lockBodyScroll() {
  state.savedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${state.savedScrollY}px`;
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

/**
 * Unlock body scroll
 */
export function unlockBodyScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  window.scrollTo(0, state.savedScrollY);
}

/**
 * Close fullscreen modal
 * Separated from modal.js to prevent circular dependency with keyboard.js
 */
export async function closeModal() {
  if (!state.isModalOpen) return;

  try {
    // 1. Run modal-specific cleanup functions (event listeners, focus trap, etc.)
    // MUST run first while the DOM and viewport are still intact.
    runModalCleanupFunctions();

    // 2. Stop visual viewport sync before teardown
    stopVisualViewportSync();

    // 3. Cleanup features (awaited to ensure state is clean before DOM removal)
    // We use try/catch inside each import to ensure one failure doesn't block the rest.
    await Promise.all([
      import("../features/lazy/search.js")
        .then((m) => m.clearSearch())
        .catch((e) => console.warn("DiagView: Search cleanup failed", e)),
      import("../features/lazy/minimap.js")
        .then((m) => m.cleanupMinimap())
        .catch((e) => console.warn("DiagView: Minimap cleanup failed", e)),
      import("../features/lazy/rotate.js")
        .then((m) => m.cleanupRotation())
        .catch((e) => console.warn("DiagView: Rotation cleanup failed", e)),
    ]);

    // 4. Hide keyboard help and active toasts
    hideKeyboardHelp();
    hideToast();

    // 5. Destroy panzoom safely
    if (state.activePanzoom) {
      safeDestroy(state.activePanzoom, "destroy");
      state.activePanzoom = null;
    }

    // 6. Final UI Teardown
    const modal = document.getElementById("diagview-modal");
    const viewport = document.getElementById("diagview-modal-viewport");
    const menu = document.getElementById("diagview-temp-menu");

    if (viewport) {
      viewport.replaceChildren();
      viewport.classList.remove("dv-text-select");
    }

    if (menu) {
      menu.remove();
    }

    if (modal) {
      modal.classList.remove("open");
      modal.classList.remove("animate-open");

      // Exit fullscreen if active
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
    }

    // Reset topbar/buttons
    const topbar = document.querySelector(".diagview-topbar");
    if (topbar) {
      topbar.classList.remove("search-open");
      document.getElementById("dv-search-icon-btn")?.classList.remove("active");
      document.getElementById("dv-search-icon-btn")?.setAttribute("aria-expanded", "false");
    }

    document.getElementById("dv-text-select-btn")?.classList.remove("active");
    document.getElementById("dv-text-select-desktop-btn")?.classList.remove("active");
    document.getElementById("dv-text-select-btn")?.setAttribute("aria-pressed", "false");
    document.getElementById("dv-text-select-desktop-btn")?.setAttribute("aria-pressed", "false");

    // Clear async tasks related to the modal session
    clearAsyncTasks(state);
  } catch (error) {
    console.error("DiagView: Error during closeModal cleanup:", error);
  } finally {
    // 7. Critical State Reset (Always run even if cleanup fails)
    state.isModalOpen = false;
    state.isModalOpening = false;
    state.activeSourceElement = null;
    state.touchState = {
      isPinching: false,
      lastTouchCount: 0,
      initialDistance: 0,
    };

    // Restore body scroll
    unlockBodyScroll();

    // Clean up history state (mobile back button support)
    cleanupModalHistoryState();

    // Restore focus
    restoreFocus();

    // 8. Public Callback
    if (state.config.onClose) {
      try {
        state.config.onClose();
      } catch (e) {
        console.error("DiagView: onClose callback error:", e);
      }
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
