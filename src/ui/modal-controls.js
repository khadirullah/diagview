/**
 * DiagView Modal Controls
 * Shared modal control functions - prevents circular dependencies
 * @module ui/modal-controls
 */

import { state, runModalCleanupFunctions } from "../core/config.js";
import { safeDestroy, clearAsyncTasks, loadedChunk } from "../core/lifecycle.js";
import { removeEmptyAttr } from "../core/utils.js";
import { rootHadStyle } from "../core/theme.js";
import { restoreFocus } from "./focus-manager.js";
import { cleanupModalHistoryState, stopVisualViewportSync } from "./viewport.js";
import { hideKeyboardHelp } from "./keyboard-help.js";
import { hideToast } from "./toast.js";

// Whether <body> had a style attribute before the scroll lock wrote to it
let bodyHadStyle = true;
// Whether <html> had one before DiagView wrote its theme variables to it
let htmlHadStyle = true;
// The inline overflow of <html> and <body> before the lock. The longhands
// too, since the shorthand reads "" when the page set only overflow-y.
const OVERFLOW = ["overflow", "overflow-x", "overflow-y"];
let savedOverflow = [];
// The page's inline scroll-behavior, and the frame that puts it back
let savedScrollBehavior = "";
let scrollBehaviorFrame = 0;

/**
 * Lock body scroll (Non-destructive version)
 * Satisfies Req 3: Persistence of background zoom and scroll position.
 */
export function lockBodyScroll() {
  state.savedScrollY = window.scrollY;

  // FIX: Suppress CSS scroll-behavior BEFORE touching overflow/scroll.
  // Some browsers animate the scroll position change that can happen when
  // overflow:hidden is applied to <html>, which then shows as a jump on close.
  const htmlEl = document.documentElement;
  // Stash whatever the page had so we can restore it on unlock. A reopen
  // before the last close put it back keeps the stash, since the page
  // value still reads "auto" then.
  if (scrollBehaviorFrame) cancelAnimationFrame(scrollBehaviorFrame);
  else savedScrollBehavior = htmlEl.style.scrollBehavior;
  scrollBehaviorFrame = 0;
  htmlEl.style.scrollBehavior = "auto";
  htmlHadStyle = rootHadStyle();

  // 1. Standard lock for most browsers
  bodyHadStyle = document.body.hasAttribute("style");
  savedOverflow = [htmlEl, document.body].map((el) =>
    OVERFLOW.map((p) => el.style.getPropertyValue(p)),
  );
  htmlEl.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // 2. iOS Safari Elastic Scroll Prevention + Pinch-Zoom Protection
  // We prevent touchmove on the document to stop background scrolling.
  // We also prevent multi-finger gestures OUTSIDE the diagram viewport
  // to stop native pinch-zoom on UI chrome (topbar, FAB, menu) which
  // would change the browser zoom and persist after modal close.
  const viewport = document.getElementById("diagview-modal-viewport");
  const preventDefault = (e) => {
    if (!state.isModalOpen) return;

    // Allow touch scrolling inside scrollable UI elements (e.g. floating menu, help modal)
    const target = e.target;
    const isScrollableUI =
      target &&
      (target.closest(".diagview-menu") ||
        target.closest(".diagview-help-content") ||
        target.closest("[data-scrollable]"));

    if (e.touches.length === 1) {
      // Single-finger: prevent native body scrolling everywhere EXCEPT inside scrollable UI elements
      if (!isScrollableUI && e.cancelable) e.preventDefault();
    } else if (e.touches.length >= 2) {
      // Multi-finger: only allow inside the viewport (Panzoom handles it)
      const isInViewport = viewport && viewport.contains(target);
      if (!isInViewport && !isScrollableUI && e.cancelable) e.preventDefault();
    }
  };

  document.addEventListener("touchmove", preventDefault, { passive: false });

  // Register cleanup
  state.modalCleanupFunctions.add(() => {
    document.removeEventListener("touchmove", preventDefault);
  });
}

/**
 * Unlock body scroll
 */
export function unlockBodyScroll() {
  const htmlEl = document.documentElement;
  [htmlEl, document.body].forEach((el, i) =>
    OVERFLOW.forEach((p, j) => {
      const value = savedOverflow[i]?.[j];
      if (value) el.style.setProperty(p, value);
      else el.style.removeProperty(p);
    }),
  );
  removeEmptyAttr(document.body, "style", bodyHadStyle);

  // FIX: Use { behavior: "instant" } to restore scroll position without any
  // visible animation. This is the primary fix for the "scroll-to-top" jump:
  // even if the browser reset scrollY to 0 during the lock, we jump back
  // instantly rather than smoothly — making it imperceptible to the user.
  //
  // Fallback for legacy browsers (no ScrollOptions support): plain scrollTo.
  try {
    window.scrollTo({ top: state.savedScrollY, behavior: "instant" });
  } catch (_) {
    window.scrollTo(0, state.savedScrollY);
  }

  // Restore whatever scroll-behavior the page had, but only after the
  // instant scroll has been committed (next frame), so the restore itself
  // doesn't get caught by the page's smooth-scroll rules.
  scrollBehaviorFrame = requestAnimationFrame(() => {
    scrollBehaviorFrame = 0;
    htmlEl.style.scrollBehavior = savedScrollBehavior;
    // destroy() may have removed the theme variables since, so drop the
    // style attribute this leaves empty unless the page had one
    removeEmptyAttr(htmlEl, "style", htmlHadStyle);
  });
}

/**
 * Close fullscreen modal
 * Separated from modal.js to prevent circular dependency with keyboard.js
 */
export async function closeModal() {
  if (!state.isModalOpen) return;
  // Re-entrancy guard: a second Escape or close click during the teardown
  // must not run it (and onClose) twice
  if (state.isModalClosing) return;
  state.isModalClosing = true;

  try {
    // 1. Run modal-specific cleanup functions (event listeners, focus trap, etc.)
    // MUST run first while the DOM and viewport are still intact.
    runModalCleanupFunctions();

    // 2. Stop visual viewport sync before teardown
    stopVisualViewportSync();

    // 3. Clean up the features this page has loaded. A chunk that never
    // loaded has nothing to clean up, so closing never downloads one.
    const cleanUp = (name, run) => {
      const chunk = loadedChunk(name);
      try {
        if (chunk) run(chunk);
      } catch (e) {
        console.warn(`DiagView: ${name} cleanup failed`, e);
      }
    };
    cleanUp("search", (m) => m.clearSearch());
    cleanUp("minimap", (m) => m.cleanupMinimap());
    cleanUp("rotate", (m) => m.cleanupRotation());

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
    }

    // Reset topbar/buttons
    const topbar = document.querySelector(".diagview-topbar");
    if (topbar) {
      topbar.classList.remove("search-open");
      document.getElementById("dv-search-icon-btn")?.classList.remove("active");
      document.getElementById("dv-search-icon-btn")?.setAttribute("aria-expanded", "false");
    }

    ["dv-text-select-btn", "dv-text-select-desktop-btn"].forEach((id) => {
      const btn = document.getElementById(id);
      btn?.classList.remove("active");
      btn?.setAttribute("aria-pressed", "false");
    });

    // Clear async tasks related to the modal session
    clearAsyncTasks(state);
  } catch (error) {
    console.error("DiagView: Error during closeModal cleanup:", error);
  } finally {
    // 7. Critical State Reset (Always run even if cleanup fails)
    state.isModalOpen = false;
    state.isModalOpening = false;
    state.isModalClosing = false;
    state.activeSourceElement = null;
    state.touchState = { isPinching: false };

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
 * Sync branding and shortcut hint visibility based on current configuration
 * Reactive to runtime config changes
 */
export function syncBrandingVisibility() {
  const modal = document.getElementById("diagview-modal");
  const menu = document.getElementById("diagview-temp-menu");
  // No "Press ? for shortcuts" when ? opens nothing
  modal?.classList.toggle("dv-no-help", !state.config.showKeyboardHelp);

  const shouldHide = state.config.showBranding === false;
  [modal, menu].forEach((el) => el?.classList.toggle("dv-hide-branding", shouldHide));
}
