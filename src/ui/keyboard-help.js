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

  // Reset timer on any interaction with the modal
  content.addEventListener("mousemove", startAutoCloseTimer);
  content.addEventListener("touchstart", startAutoCloseTimer);

  document.body.appendChild(helpModal);

  // Initialize pause events
  cleanupPause = setupAutoPauseEvents(helpModal);

  return helpModal;
}

/**
 * Show keyboard help modal
 */
export function showKeyboardHelp() {
  if (!state.config.showKeyboardHelp) return;

  const modal = createHelpModal();
  modal.classList.add("show");

  // Start auto-close timer
  startAutoCloseTimer();

  // Focus close button for accessibility
  const closeBtn = modal.querySelector(".diagview-help-close");
  if (closeBtn) closeBtn.focus();
}

/**
 * Hide keyboard help modal
 */
export function hideKeyboardHelp() {
  clearAutoCloseTimer();
  if (helpModal) {
    helpModal.classList.remove("show");
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
  if (cleanupPause) {
    cleanupPause();
    cleanupPause = null;
  }
  if (helpModal) {
    helpModal.remove();
    helpModal = null;
  }
}
