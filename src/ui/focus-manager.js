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

// Inputs that are pressed or picked rather than typed into. Letter shortcuts
// still work while one of them has focus.
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "color",
  "button",
  "submit",
  "reset",
  "file",
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
    ((active.tagName === "INPUT" && !NON_TEXT_INPUTS.has(active.type)) ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable)
  );
}

/**
 * Save current focus state
 */
export function saveFocus() {
  let el = document.activeElement;
  // Focus inside a shadow root reports the host, so follow it to the real element
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  // Clicking a diagram with no toolbar (layout "off") leaves focus on body.
  // Return to the diagram instead, so keyboard users keep their place. It
  // holds tabindex -1 until it loses focus, so it never joins the tab order.
  if (el === document.body && (el = state.activeSourceElement) && !el.hasAttribute("tabindex")) {
    el.tabIndex = -1;
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  state.lastActiveElement = el;
}

/**
 * Restore previous focus state
 */
export function restoreFocus() {
  const target = state.lastActiveElement;
  state.lastActiveElement = null;
  // Fall back to body when the element left the document
  if (target) (target.isConnected ? target : document.body).focus({ preventScroll: true });
}

/**
 * Setup focus management for modal
 */
export function setupModalFocusManagement() {
  if (state.focusManagementSetup) return;

  const modal = document.getElementById("diagview-modal");
  if (!modal) return;
  state.focusManagementSetup = true;

  // The focusable list depends on the current search/topbar state — rebuild
  // it for every session rather than serving a list from the previous one.
  invalidateFocusableCache();

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

  // Space and Enter press the focused button, link, checkbox or colour
  // picker. Every other shortcut still works there. A keyboard user never
  // presses F or R to operate a button, and after Esc closes the menu, focus
  // stays on the menu button.
  const isControl =
    target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "INPUT";
  if (isControl && (event.key === "Enter" || event.key === " ")) {
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
 * True when the element is actually rendered. getComputedStyle(el).display
 * only reflects the element's own declaration, so children of a display:none
 * ancestor (the .dv-topbar-actions row on desktop) used to pass as focusable
 * and the trap then "focused" elements the browser cannot focus.
 * @private
 */
function isRendered(el) {
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true });
  }
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

/**
 * The mobile search container collapses to opacity:0 / pointer-events:none
 * while closed, which keeps its input and buttons in the tab order although
 * they are invisible. On desktop the same container is always shown (the
 * topbar never gets "search-open"), so only the collapsed styles disqualify.
 * @private
 */
function isInClosedSearch(el) {
  const container = el.closest(".diagview-search-container");
  if (!container) return false;
  const topbar = container.closest(".diagview-topbar");
  if (topbar && topbar.classList.contains("search-open")) return false;
  const style = window.getComputedStyle(container);
  return style.opacity === "0" || style.pointerEvents === "none";
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
      // a[*|href] also matches SVG links written with xlink:href, as Mermaid 10 does
      'button:not([disabled]), a[*|href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return isRendered(el) && !isInClosedSearch(el);
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

    // The open shortcuts panel is modal too, so Tab stays on its close button
    const help = modal.querySelector(".diagview-help-modal.show");
    const focusableElements = help
      ? [...help.querySelectorAll("button")]
      : getFocusableElements(modal);
    if (focusableElements.length === 0) return;

    // Own every Tab step, not only the wrap-around: the browser's native
    // order still stops on controls we filtered out (e.g. the collapsed
    // mobile search input), so step through our own list instead.
    const len = focusableElements.length;
    const dir = e.shiftKey ? -1 : 1;
    const idx = focusableElements.indexOf(document.activeElement);
    // Unknown position (modal itself, or focus outside): enter at the
    // matching end so Tab lands on the first and Shift+Tab on the last.
    let i = idx >= 0 ? idx : dir > 0 ? -1 : len;

    e.preventDefault();
    for (let n = 0; n < len; n++) {
      i = (i + dir + len) % len;
      const candidate = focusableElements[i];
      candidate.focus();
      // Skip anything the browser refused to focus after all
      if (document.activeElement === candidate) return;
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
