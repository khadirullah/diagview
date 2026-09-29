/**
 * DiagView Keyboard Shortcuts
 * Global keyboard event handling with proper focus management
 * @module features/keyboard
 */

import { state } from "../core/config.js";
import { PAN, TIMING } from "../core/constants.js";
import { shouldHandleKeyboardEvent, isInputFocused } from "../ui/focus-manager.js";
import { closeModal } from "../ui/modal-controls.js";
import { toggleKeyboardHelp, isHelpVisible, hideKeyboardHelp } from "../ui/keyboard-help.js";
import { closeMenuHint } from "../ui/toast.js";

/** Whether a key was pressed outside a text field during this page visit */
export let keysUsed = false;

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcut(e) {
  // On-screen keyboards only type into text fields, so any other key press
  // means a real keyboard. Touch screens show the key badges from then on.
  const t = !keysUsed && e.composedPath()[0];
  if (
    t &&
    !e.isComposing &&
    !/^(Unidentified|Process)$/.test(e.key) &&
    !t.isContentEditable &&
    !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
  ) {
    keysUsed = true;
    document.getElementById("diagview-modal")?.classList.add("dv-keys");
  }

  // Smart Escape Handling
  if (e.key === "Escape") {
    // If help modal is open, close it first
    if (isHelpVisible()) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      hideKeyboardHelp();
      return;
    }

    // Two-stage Escape while searching. This handler is window-level capture,
    // so it runs BEFORE the search input's own Escape handler — without this
    // guard, Escape while typing closes the whole modal instead of clearing
    // the query.
    const searchInput = document.getElementById("diagview-search");
    if (searchInput && document.activeElement === searchInput) {
      if (searchInput.value) {
        // Stage 1: let the search input's own handler clear the query.
        return;
      }
      // Stage 2: empty query — exit search mode; the next Escape closes the
      // modal. Move focus off the (now hidden) input, or this branch would
      // capture every subsequent Escape too.
      document.getElementById("diagview-search-back")?.click();
      searchInput.blur();
      document.getElementById("diagview-modal")?.focus();
      return;
    }

    // An open ☰ menu closes first and hands focus back to its button
    const fab = document.querySelector("#dv-toggle.open");
    if (fab) {
      fab.click();
      fab.focus();
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

  // ? key - show help. Not while typing: "?" must still be typeable into the
  // search box (or any other input / contenteditable inside the modal).
  if (e.key === "?" && state.isModalOpen) {
    if (isInputFocused()) return;
    e.preventDefault();
    toggleKeyboardHelp();
    return;
  }

  // The open help panel is modal: no shortcut reaches the diagram behind it.
  // Arrow keys keep their default and scroll the panel's list.
  if (isHelpVisible()) return;

  // Check if we should handle other keyboard events
  if (!shouldHandleKeyboardEvent(e)) {
    return;
  }

  // Panzoom controls
  if (!state.activePanzoom) return;

  const moveStep = e.shiftKey ? PAN.STEP_FAST : PAN.STEP_NORMAL;

  // Handle zoom shortcuts
  if (["+", "=", "-", "_", "0", " "].includes(e.key)) {
    closeMenuHint(); // the reader is working with the diagram
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
          // SVG links have no click() method, so send the event itself
          linkTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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
    // In the open ☰ menu and on its button the arrows belong to the menu
    if (e.target.closest?.(".diagview-menu.active, #dv-toggle.open")) return;
    e.preventDefault();
    closeMenuHint();

    let dx = 0;
    let dy = 0;

    if (e.key === "ArrowUp") dy = state.config.naturalPanning ? -moveStep : moveStep;
    if (e.key === "ArrowDown") dy = state.config.naturalPanning ? moveStep : -moveStep;
    if (e.key === "ArrowLeft") dx = state.config.naturalPanning ? -moveStep : moveStep;
    if (e.key === "ArrowRight") dx = state.config.naturalPanning ? moveStep : -moveStep;

    // No rotation compensation: rotation is applied on an inner <g> inside the
    // SVG (see rotate.js) while Panzoom transforms the outer element, so pan
    // deltas are already in screen axes. Minimap and share-restore rely on the
    // same fact; compensating here inverted the arrows at 90/180/270.

    state.activePanzoom.pan(dx, dy, {
      relative: true,
      animate: true,
      duration: state.config.panAnimationDuration ?? TIMING.PAN_ANIMATION_DURATION,
    });
    return;
  }

  switch (e.key) {
    case "m":
    case "M":
      e.preventDefault();
      import("./lazy/meeting-mode.js")
        .then((m) => m.toggleMeetingMode())
        .catch((err) => console.error("DiagView: Failed to load Meeting Mode", err));
      break;

    case "l":
    case "L":
      e.preventDefault();
      import("./lazy/share.js")
        .then((m) => m.shareLink(state.currentDiagramIndex))
        .catch((err) => console.error("DiagView: Failed to load Share Link", err));
      break;

    case "r":
    case "R":
      e.preventDefault();
      import("./lazy/rotate.js")
        .then((m) => m.rotateDiagram())
        .catch((err) => console.error("DiagView: Failed to load Rotate", err));
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
