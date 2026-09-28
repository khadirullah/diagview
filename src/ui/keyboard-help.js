/**
 * DiagView Keyboard Shortcuts Help Modal
 * Shows available keyboard shortcuts with auto-close
 * @module ui/keyboard-help
 */

import { state } from "../core/config.js";
import { TIMING } from "../core/constants.js";
import { setSVGContent } from "../core/utils.js";
import { registerTimeout } from "../core/lifecycle.js";

const SHORTCUTS = [
  { keys: ["Esc"], desc: "Close fullscreen" },
  { keys: ["Space", "0"], desc: "Reset / Fit to screen" },
  { keys: ["F"], desc: "Focus search" },
  { keys: ["T"], desc: "Toggle text select (copy SVG labels)" },
  { keys: ["R"], desc: "Rotate 90°" },
  { keys: ["M"], desc: "Meeting mode (laser pointer)" },
  { keys: ["L"], desc: "Share link" },
  { keys: ["+", "="], desc: "Zoom in" },
  { keys: ["-", "_"], desc: "Zoom out" },
  { keys: ["↑", "↓", "←", "→"], desc: "Pan diagram" },
  { keys: ["Shift", "+", "Arrows"], desc: "Fast pan" },
  { keys: ["?"], desc: "Show this help" },
];

let helpModal = null;
let autoCloseTimer = null;
let cleanupPause = null;
let returnFocus = null;

/**
 * Start or reset the auto-close timer
 * Uses helpTimeout from config (default: 8000ms, set 0 to disable)
 */
function startAutoCloseTimer() {
  clearAutoCloseTimer();
  const timeout = state.config.helpTimeout ?? TIMING.HELP_FADE_TIMEOUT;
  if (timeout <= 0) return; // Disabled if 0 or negative

  autoCloseTimer = registerTimeout(
    state,
    () => {
      autoCloseTimer = null;
      hideKeyboardHelp();
    },
    timeout,
  );
}

/**
 * Clear the auto-close timer
 */
function clearAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    state.asyncTasks.timeouts.delete(autoCloseTimer);
    autoCloseTimer = null;
  }
}

/**
 * Setup hover/focus pause events for auto-close timer (WCAG 2.2.1)
 */
function setupAutoPauseEvents(modal) {
  const pause = () => clearAutoCloseTimer();
  const resume = () => startAutoCloseTimer();

  modal.addEventListener("mouseenter", pause);
  modal.addEventListener("focus", pause, true); // capture phase
  modal.addEventListener("mouseleave", resume);
  modal.addEventListener("blur", resume, true);

  return () => {
    modal.removeEventListener("mouseenter", pause);
    modal.removeEventListener("focus", pause, true);
    modal.removeEventListener("mouseleave", resume);
    modal.removeEventListener("blur", resume, true);
  };
}

/**
 * Create the help modal element
 */
function createHelpModal() {
  if (helpModal && document.body.contains(helpModal)) {
    return helpModal;
  }

  helpModal = document.createElement("div");
  helpModal.className = "diagview-help-modal";
  helpModal.id = "diagview-help-modal";
  helpModal.setAttribute("role", "dialog");
  helpModal.setAttribute("aria-modal", "true");
  helpModal.setAttribute("aria-labelledby", "dv-help-title");

  const content = document.createElement("div");
  content.className = "diagview-help-content";

  // Title
  const title = document.createElement("div");
  title.className = "diagview-help-title";
  title.id = "dv-help-title";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = "Keyboard Shortcuts";

  const closeBtn = document.createElement("button");
  closeBtn.className = "diagview-help-close";
  closeBtn.setAttribute("aria-label", "Close help");
  closeBtn.setAttribute("type", "button");
  setSVGContent(
    closeBtn,
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  );

  title.append(titleSpan, closeBtn);

  // Shortcuts grid
  const grid = document.createElement("div");
  grid.className = "diagview-help-grid";

  SHORTCUTS.forEach(({ keys, desc }) => {
    const row = document.createElement("div");
    row.className = "diagview-help-row";

    const keyEl = document.createElement("div");
    keyEl.className = "diagview-help-key";
    keys.forEach((k, index) => {
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      keyEl.appendChild(kbd);
      if (index < keys.length - 1) {
        keyEl.appendChild(document.createTextNode(" "));
      }
    });

    const descEl = document.createElement("div");
    descEl.className = "diagview-help-desc";
    descEl.textContent = desc;

    row.appendChild(keyEl);
    row.appendChild(descEl);
    grid.appendChild(row);
  });

  content.appendChild(title);
  content.appendChild(grid);
  helpModal.appendChild(content);

  // Close handlers
  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) {
      hideKeyboardHelp();
    }
  });

  closeBtn.addEventListener("click", hideKeyboardHelp);

  // Reset timer on touch; mouse hover pauses it (see setupAutoPauseEvents)
  content.addEventListener("touchstart", startAutoCloseTimer);

  // SEC-7: Determine the best parent for the help modal.
  // If the main diagram modal is open, we append the help modal TO THE MODAL.
  // This ensures it inherits the "Visual Viewport Sync" transform and 1:1 scale.
  const modal = document.getElementById("diagview-modal");
  const targetParent = modal && document.contains(modal) ? modal : document.body;
  targetParent.appendChild(helpModal);

  // Pause on the card, not the full-screen backdrop that is always under the pointer
  cleanupPause = setupAutoPauseEvents(content);

  return helpModal;
}

/**
 * Show keyboard help modal
 */
export function showKeyboardHelp() {
  if (!state.config.showKeyboardHelp) return;

  const modal = createHelpModal();
  if (!modal.classList.contains("show")) returnFocus = document.activeElement;
  modal.classList.add("show");

  // Focus close button for accessibility
  const closeBtn = modal.querySelector(".diagview-help-close");
  if (closeBtn) closeBtn.focus();

  // Start the timer after focusing: the focus pause listener would clear it
  startAutoCloseTimer();
}

/**
 * Hide keyboard help modal
 */
export function hideKeyboardHelp() {
  clearAutoCloseTimer();
  const back = returnFocus;
  returnFocus = null;
  if (helpModal) {
    // Hand focus back unless it has already moved to another control.
    // A click on the backdrop leaves it on the viewer or the page body.
    const active = document.activeElement;
    const viewer = document.getElementById("diagview-modal");
    const giveBack = helpModal.contains(active) || active === viewer || active === document.body;
    helpModal.classList.remove("show");
    if (giveBack && back?.isConnected) back.focus({ preventScroll: true });
  }
}

/**
 * Toggle keyboard help modal
 */
export function toggleKeyboardHelp() {
  if (helpModal?.classList.contains("show")) {
    hideKeyboardHelp();
  } else {
    showKeyboardHelp();
  }
}

/**
 * Check if help modal is visible
 */
export function isHelpVisible() {
  return helpModal?.classList.contains("show") ?? false;
}

/**
 * Cleanup help modal
 */
export function cleanupKeyboardHelp() {
  clearAutoCloseTimer();
  returnFocus = null;
  if (cleanupPause) {
    cleanupPause();
    cleanupPause = null;
  }
  if (helpModal) {
    helpModal.remove();
    helpModal = null;
  }
}
