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
      case " ":
        e.preventDefault();
        // Special case: Space key on a link (<a>) should still be handled by DiagView
        // to prevent background page scroll and provide custom Space-to-Click behavior.
        if (e.target.tagName === "A") {
          e.target.click();
        } else {
          state.activePanzoom.reset({ animate: true });
        }
        break;
    }
    return;
  }

  // Handle panning directions based on config
  // Traditional: Up moves diagram Down (+Y)
  // Natural: Up moves diagram Up (-Y)
  const isNatural = state.config.naturalPanning;

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowUp") dy = isNatural ? -moveStep : moveStep;
    if (e.key === "ArrowDown") dy = isNatural ? moveStep : -moveStep;
    if (e.key === "ArrowLeft") dx = isNatural ? -moveStep : moveStep;
    if (e.key === "ArrowRight") dx = isNatural ? moveStep : -moveStep;

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
        // Focus search input
        const searchInput = document.getElementById("diagview-search");
        if (searchInput) {
          searchInput.focus();
        }
      }
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
