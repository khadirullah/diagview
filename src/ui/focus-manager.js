/**
 * DiagView Focus Manager
 * Handles focus states and keyboard navigation
 * Fixes the issue where keyboard controls move search cursor instead of canvas
 * @module ui/focus-manager
 */

import { state } from "../core/config.js";
import { addModalCleanupFunction } from "../core/lifecycle.js";

// Focus Management State handled via state.focusManagementSetup in config.js
let _focusCacheTimestamp = 0;
const FOCUS_CACHE_TTL = 500; // ms

const LAYOUT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "+",
  "=",
  "-",
  "_",
  "0",
  " ",
]);

/**
 * Blur active element if it's an interactive UI element (input, button, link)
 */
export function blurActiveElement() {
  const active = document.activeElement;
  const isInteractive =
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "BUTTON" ||
      active.tagName === "A" ||
      active.isContentEditable);

  if (isInteractive) {
    active.blur();
  }
}

/**
 * Check if an input element is focused
 */
export function isInputFocused() {
  const active = document.activeElement;
  return (
    active &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
  );
}

/**
 * Save current focus state
 */
export function saveFocus() {
  state.lastActiveElement = document.activeElement;
}

/**
 * Restore previous focus state
 */
export function restoreFocus() {
  const target = state.lastActiveElement;
  if (target) {
    try {
      // Only focus if still in the document
      if (document.contains(target)) {
        target.focus({ preventScroll: true });
      } else {
        // Fallback: focus the document body so keyboard navigation resumes
        document.body.focus();
      }
    } catch (e) {
      document.body.focus();
    }
  }
  state.lastActiveElement = null;
}

/**
 * Setup focus management for modal
 */
export function setupModalFocusManagement() {
  if (state.focusManagementSetup) return;
  state.focusManagementSetup = true;

  const modal = document.getElementById("diagview-modal");
  if (!modal) return;

  // OPTIMIZATION: Track last execution to prevent double-firing for pointerdown + mousedown
  let lastBlurTime = 0;

  const handleBlur = (e) => {
    const now = Date.now();
    // Ignore events firing in rapid succession (e.g., pointerdown followed by mousedown)
    // or high-frequency wheel events if focus is already handled.
    if (now - lastBlurTime < 50) return;

    // Check if we even need to blur (is focus already on the modal or body?)
    const active = document.activeElement;
    if (active === modal || active === document.body) {
      // Still allow the timestamp update for wheel events to keep them quiet
      if (e.type === "wheel") lastBlurTime = now;
      return;
    }

    const isUI = e.target.closest(".diagview-topbar, .diagview-fab-container, .diagview-menu");
    if (!isUI) {
      lastBlurTime = now;
      blurActiveElement();
      // Only focus if needed
      if (document.activeElement !== modal) {
        modal.focus();
      }
    }
  };

  modal.addEventListener("mousedown", handleBlur, true);
  modal.addEventListener("pointerdown", handleBlur, true);
  modal.addEventListener("wheel", handleBlur, { passive: true, capture: true });
  modal.addEventListener("touchstart", handleBlur, true);

  // Setup focus trap and register full cleanup
  const cleanupTrap = setupFocusTrap();

  addModalCleanupFunction(() => {
    modal.removeEventListener("mousedown", handleBlur, true);
    modal.removeEventListener("pointerdown", handleBlur, true);
    modal.removeEventListener("wheel", handleBlur, true);
    modal.removeEventListener("touchstart", handleBlur, true);
    cleanupTrap();
    state.focusManagementSetup = false;
  });
}

/**
 * Check if keyboard event should be handled by canvas
 */
export function shouldHandleKeyboardEvent(event) {
  // Don't handle if modal is not open
  if (!state.isModalOpen) return false;

  // Don't handle if input is focused
  if (isInputFocused()) return false;

  const target = event.target;

  // Special case: Space key on a link (<a>) or its children should still be handled by DiagView
  // to prevent background page scroll and provide custom Space-to-Click behavior.
  if (event.key === " " && target && target.closest && target.closest("a")) {
    return true;
  }

  const isInteractive =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "BUTTON" ||
    target.tagName === "A" ||
    target.isContentEditable;

  if (isInteractive) {
    // If we are on a button or link, we only allow specific navigation/layout keys
    if (target.tagName === "BUTTON" || target.tagName === "A") {
      if (event.key === "Escape") return true; // Always allow Escape to close modal/help

      // Reserved keys for native activation must not be handled by DiagView shortcuts
      if (target.tagName === "BUTTON" && (event.key === " " || event.key === "Enter")) {
        return false;
      }
      if (target.tagName === "A" && event.key === "Enter") {
        return false;
      }

      // Allow navigation and zoom keys to pass through to handleKeyboardShortcut
      if (LAYOUT_KEYS.has(event.key)) {
        return true;
      }

      // Block all other single-character shortcuts (R, M, L, F, T, etc.)
      // to prevent conflicts with focused UI elements.
      return false;
    }

    return false;
  }

  return true;
}

/**
 * Invalidate the focusable elements cache
 */
export function invalidateFocusableCache() {
  state.focusableElements = null;
  _focusCacheTimestamp = 0;
}

/**
 * Get all focusable elements within modal (with caching)
 */
function getFocusableElements(modal) {
  const now = Date.now();
  if (state.focusableElements && now - _focusCacheTimestamp < FOCUS_CACHE_TTL) {
    return state.focusableElements;
  }

  const focusable = Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    // Include elements that are visible (not display:none or visibility:hidden)
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  state.focusableElements = focusable;
  _focusCacheTimestamp = now;
  return focusable;
}

/**
 * Set initial focus when modal opens
 */
export function setInitialFocus() {
  const modal = document.getElementById("diagview-modal");
  if (!modal) return;

  // Focus the modal container itself for a "silent" start.
  // This captures keyboard events without showing a focus ring on an input.
  modal.focus();
}

/**
 * Focus trap for modal - prevents Tab from escaping to elements behind the modal
 */
export function setupFocusTrap() {
  const modal = document.getElementById("diagview-modal");
  if (!modal) return;

  const trapFocus = (e) => {
    // Only trap when modal is open
    if (!state.isModalOpen) return;
    if (e.key !== "Tab") return;

    const focusableElements = getFocusableElements(modal);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    // Check if current focus is within modal
    const isInModal = modal.contains(activeElement);

    if (e.shiftKey) {
      // Shift + Tab - going backwards
      if (!isInModal || activeElement === firstElement || activeElement === modal) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab - going forwards
      if (!isInModal || activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  // Use capture phase to intercept before other handlers
  document.addEventListener("keydown", trapFocus, true);

  return () => {
    document.removeEventListener("keydown", trapFocus, true);
  };
}

/**
 * Reset focus management state for re-initialization
 */
export function resetFocusManagement() {
  state.focusManagementSetup = false;
  _focusCacheTimestamp = 0;
}
