/**
 * DiagView Focus Manager
 * Handles focus states and keyboard navigation
 * Fixes the issue where keyboard controls move search cursor instead of canvas
 * @module ui/focus-manager
 */

import { state } from "../core/config.js";

/**
 * Blur active element if it's an input
 */
export function blurIfInput() {
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
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
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
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
  if (state.lastActiveElement && state.lastActiveElement.focus) {
    try {
      state.lastActiveElement.focus();
    } catch (e) {
      // Element might no longer exist
    }
  }
  state.lastActiveElement = null;
}

/**
 * Setup focus management for modal
 */
export function setupModalFocusManagement() {
  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");

  if (!modal || !viewport) return;

  // When viewport is clicked, blur any focused inputs
  viewport.addEventListener(
    "mousedown",
    () => {
      blurIfInput();
    },
    { passive: true },
  );

  // When viewport receives wheel event, blur inputs
  viewport.addEventListener(
    "wheel",
    () => {
      blurIfInput();
    },
    { passive: true },
  );

  // When viewport starts touch, blur inputs
  viewport.addEventListener(
    "touchstart",
    () => {
      blurIfInput();
    },
    { passive: true },
  );

  // Setup focus trap immediately
  setupFocusTrap();
}

/**
 * Check if keyboard event should be handled by canvas
 */
export function shouldHandleKeyboardEvent(event) {
  // Don't handle if modal is not open
  if (!state.isModalOpen) return false;

  // Don't handle if input is focused
  if (isInputFocused()) return false;

  // Don't handle if event is from input
  const target = event.target;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    return false;
  }

  return true;
}

/**
 * Get all focusable elements within modal
 */
function getFocusableElements(modal) {
  return Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => {
    // Only include visible elements
    return el.offsetParent !== null && window.getComputedStyle(el).visibility !== "hidden";
  });
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
      if (!isInModal || activeElement === firstElement) {
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
