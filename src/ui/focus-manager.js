/**
 * DiagView Focus Manager
 * Handles focus states and keyboard navigation
 * Fixes the issue where keyboard controls move search cursor instead of canvas
 * @module ui/focus-manager
 */

import { state } from "../core/config.js";
import { addModalCleanupFunction } from "../core/lifecycle.js";

// Focus Management State handled via state.focusManagementSetup in config.js

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
  if (state.focusManagementSetup) return;
  state.focusManagementSetup = true;

  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");

  if (!modal || !viewport) return;

  // Track listeners for cleanup
  const handleBlur = () => blurActiveElement();

  viewport.addEventListener("mousedown", handleBlur, { passive: true });
  viewport.addEventListener("wheel", handleBlur, { passive: true });
  viewport.addEventListener("touchstart", handleBlur, { passive: true });

  // Setup focus trap and register full cleanup
  const cleanupTrap = setupFocusTrap();

  addModalCleanupFunction(() => {
    viewport.removeEventListener("mousedown", handleBlur);
    viewport.removeEventListener("wheel", handleBlur);
    viewport.removeEventListener("touchstart", handleBlur);
    cleanupTrap();
    state.focusManagementSetup = false; // Reset guard so it can re-init on next open
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

  // Special case: Space key on a link (<a>) should still be handled by DiagView
  // to prevent background page scroll and provide custom Space-to-Click behavior.
  if (event.key === " " && target.tagName === "A") {
    return true;
  }

  const isInteractive =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "BUTTON" ||
    target.tagName === "A" ||
    target.isContentEditable;

  if (isInteractive) {
    // If focus is on a BUTTON, Space/Enter are reserved for activation.
    if (target.tagName === "BUTTON" && (event.key === " " || event.key === "Enter")) {
      return false;
    }
    // If focus is on a LINK (<a>), Enter is reserved for activation.
    if (target.tagName === "A" && event.key === "Enter") {
      return false;
    }

    // For all other keys (Arrows, R, M, L, 0, etc.),
    // we allow DiagView to handle the shortcut even if a button/link is focused.
    return true;
  }

  return true;
}

/**
 * Get all focusable elements within modal
 */
function getFocusableElements(modal) {
  return Array.from(
    modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    // Include elements that are visible (not display:none or visibility:hidden)
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
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

/**
 * Reset focus management state for re-initialization
 */
export function resetFocusManagement() {
  state.focusManagementSetup = false;
}
