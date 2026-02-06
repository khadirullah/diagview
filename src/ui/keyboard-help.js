/**
 * DiagView Keyboard Shortcuts Help Modal
 * Shows available keyboard shortcuts with auto-close
 * @module ui/keyboard-help
 */

import { state } from "../core/config.js";
import { TIMING } from "../core/constants.js";

const SHORTCUTS = [
  { keys: ["Esc"], desc: "Close fullscreen" },
  { keys: ["Space"], desc: "Fit diagram to screen" },
  { keys: ["F"], desc: "Focus search" },
  { keys: ["R"], desc: "Rotate 90°" },
  { keys: ["M"], desc: "Meeting mode (laser pointer)" },
  { keys: ["L"], desc: "Share link" },
  { keys: ["+", "="], desc: "Zoom in" },
  { keys: ["-"], desc: "Zoom out" },
  { keys: ["↑", "↓", "←", "→"], desc: "Pan diagram" },
  { keys: ["Shift", "+", "Arrows"], desc: "Fast pan" },
  { keys: ["?"], desc: "Show this help" },
];

let helpModal = null;
let autoCloseTimer = null;

/**
 * Start or reset the auto-close timer
 * Uses helpTimeout from config (default: 8000ms, set 0 to disable)
 */
function startAutoCloseTimer() {
  clearAutoCloseTimer();
  const timeout = state.config.helpTimeout || TIMING.HELP_FADE_TIMEOUT;
  if (timeout <= 0) return; // Disabled if 0 or negative

  autoCloseTimer = setTimeout(() => {
    hideKeyboardHelp();
  }, timeout);
}

/**
 * Clear the auto-close timer
 */
function clearAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

/**
 * Create the help modal element
 */
function createHelpModal() {
  if (helpModal) return helpModal;

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
  title.innerHTML = `
    <span>Keyboard Shortcuts</span>
    <button class="diagview-help-close" aria-label="Close help">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  // Shortcuts grid
  const grid = document.createElement("div");
  grid.className = "diagview-help-grid";

  SHORTCUTS.forEach(({ keys, desc }) => {
    const row = document.createElement("div");
    row.className = "diagview-help-row";

    const keyEl = document.createElement("div");
    keyEl.className = "diagview-help-key";
    keyEl.innerHTML = keys.map(k => `<kbd>${k}</kbd>`).join(" ");

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

  const closeBtn = title.querySelector(".diagview-help-close");
  closeBtn.addEventListener("click", hideKeyboardHelp);

  // Reset timer on any interaction with the modal
  content.addEventListener("mousemove", startAutoCloseTimer);
  content.addEventListener("touchstart", startAutoCloseTimer);

  document.body.appendChild(helpModal);
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
  if (helpModal) {
    helpModal.remove();
    helpModal = null;
  }
}
