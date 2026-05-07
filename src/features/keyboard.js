/**
 * DiagView Keyboard Shortcuts
 * Global keyboard event handling with proper focus management
 * @module features/keyboard
 */

import { state } from "../core/config.js";
import { PAN } from "../core/constants.js";
import { shouldHandleKeyboardEvent } from "../ui/focus-manager.js";
import { closeModal } from "../ui/modal-controls.js";
import { toggleKeyboardHelp, isHelpVisible, hideKeyboardHelp } from "../ui/keyboard-help.js";

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcut(e) {
  // Smart Escape Handling
  if (e.key === "Escape") {
    // If help modal is open, close it first
    if (isHelpVisible()) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      hideKeyboardHelp();
      return;
    }

    // Otherwise close the main modal
    closeModal();
    return;
  }

  // Ignore keyboard shortcuts if a modifier key is pressed (Ctrl, Meta/Cmd, Alt)
  // This prevents our single-key shortcuts (like R, F, T, L) from breaking
  // standard browser shortcuts (like Ctrl+R to refresh, Ctrl+F to find, Ctrl+T for new tab).
  if (e.ctrlKey || e.metaKey || e.altKey) {
    return;
  }

  // ? key - show help (works even if input focused)
  if (e.key === "?" && state.isModalOpen) {
    e.preventDefault();
    toggleKeyboardHelp();
    return;
  }

  // Check if we should handle other keyboard events
  if (!shouldHandleKeyboardEvent(e)) {
    return;
  }

  // Panzoom controls
  if (!state.activePanzoom) return;

  const moveStep = e.shiftKey ? PAN.STEP_FAST : PAN.STEP_NORMAL;

  // Handle zoom shortcuts
  if (["+", "=", "-", "_", "0", " "].includes(e.key)) {
    switch (e.key) {
      case "+":
      case "=":
        e.preventDefault();
        state.activePanzoom.zoomIn();
        break;
      case "-":
      case "_":
        e.preventDefault();
        state.activePanzoom.zoomOut();
        break;
      case "0":
        e.preventDefault();
        state.activePanzoom.reset({ animate: true });
        break;
      case " ": {
        // Find the interactive target (with safety check)
        const target = e.target;
        const linkTarget = target && target.closest ? target.closest("a") : null;
        const isButton =
          target && target.closest
            ? target.closest("button") || target.getAttribute("role") === "button"
            : false;
        const isInput =
          target && target.closest ? target.closest("input, textarea, select") : false;

        if (linkTarget) {
          e.preventDefault();
          e.stopPropagation();
          linkTarget.click();
        } else if (!isButton && !isInput) {
          e.preventDefault();
          state.activePanzoom.reset({ animate: true });
        }
        break;
      }
    }
    return;
  }

  // Handle panning directions based on config
  // Traditional: Up moves diagram Down (+Y)
  // Natural: Up moves diagram Up (-Y)

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();

    let dx = 0;
    let dy = 0;

    if (e.key === "ArrowUp") dy = state.config.naturalPanning ? -moveStep : moveStep;
    if (e.key === "ArrowDown") dy = state.config.naturalPanning ? moveStep : -moveStep;
    if (e.key === "ArrowLeft") dx = state.config.naturalPanning ? -moveStep : moveStep;
    if (e.key === "ArrowRight") dx = state.config.naturalPanning ? moveStep : -moveStep;

    // FIX: compensate for visual rotation so arrow direction matches screen direction
    const angle = state.rotationAngle || 0;
    if (angle !== 0) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Inverse-rotate the delta: rotate by -angle
      const ndx = dx * cos + dy * sin;
      const ndy = -dx * sin + dy * cos;
      dx = ndx;
      dy = ndy;
    }

    state.activePanzoom.pan(dx, dy, {
      relative: true,
      animate: true,
    });
    return;
  }

  switch (e.key) {
    case "m":
    case "M":
      e.preventDefault();
      import("./lazy/meeting-mode.js").then((m) => m.toggleMeetingMode());
      break;

    case "l":
    case "L":
      e.preventDefault();
      import("./lazy/share.js").then((m) => m.shareLink(state.currentDiagramIndex));
      break;

    case "r":
    case "R":
      e.preventDefault();
      import("./lazy/rotate.js").then((m) => m.rotateDiagram());
      break;

    case "f":
    case "F":
      e.preventDefault();
      {
        // Focus search — on mobile open the search bar first
        const topbar = document.querySelector(".diagview-topbar");
        if (topbar && !topbar.classList.contains("search-open")) {
          document.getElementById("dv-search-icon-btn")?.click();
        } else {
          const searchInput = document.getElementById("diagview-search");
          if (searchInput) searchInput.focus();
        }
      }
      break;

    case "t":
    case "T":
      e.preventDefault();
      state.events.emit("dv:toggle-text-select");
      break;
  }
}

/**
 * Setup keyboard shortcut handlers
 */
export function setupKeyboardShortcuts() {
  // Use capture phase to intercept before other handlers
  window.addEventListener("keydown", handleKeyboardShortcut, true);
}

/**
 * Remove keyboard shortcut handlers
 */
export function teardownKeyboardShortcuts() {
  window.removeEventListener("keydown", handleKeyboardShortcut, true);
}
