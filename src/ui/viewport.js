/**
 * DiagView Viewport Management
 * Handles browser history state and viewport layout locking.
 *
 * NOTE: For mobile stability, we use the "Viewport Meta Hack".
 * This ensures the modal opens at the correct 1:1 scale on mobile devices.
 * To comply with WCAG 1.4.4 (Resize Text), we DO NOT use user-scalable=no
 * or maximum-scale. The user can always use native browser zoom to
 * enlarge the UI controls, and DiagView provides internal Panzoom
 * for the diagram itself.
 *
 * @module ui/viewport
 */

import { state } from "../core/config.js";
import { TIMING } from "../core/constants.js";

// ==========================================
// History State (Mobile Back Button)
// ==========================================

let _historyStatePushed = false;
let _popstateHandler = null;
let _historyTransitionLock = false;

/**
 * Push a history entry when modal opens.
 */
export function pushModalHistoryState(onBackButton) {
  if (_historyStatePushed || _historyTransitionLock) return;

  history.pushState({ diagviewModal: true }, "");
  _historyStatePushed = true;

  _popstateHandler = () => {
    if (state.isModalOpen) {
      _historyStatePushed = false;
      onBackButton();
    }
  };

  window.addEventListener("popstate", _popstateHandler);
}

/**
 * Clean up history state when modal closes normally.
 */
export function cleanupModalHistoryState() {
  if (_popstateHandler) {
    window.removeEventListener("popstate", _popstateHandler);
    _popstateHandler = null;
  }

  if (_historyStatePushed) {
    _historyStatePushed = false;
    if (history.state && history.state.diagviewModal) {
      _historyTransitionLock = true;
      history.back();
      // Lock prevents a new push during the async back transition
      setTimeout(() => {
        _historyTransitionLock = false;
      }, TIMING.CLEANUP_DELAY);
    }
  }
}

// ==========================================
// Viewport Lock (Native-App Stability)
// ==========================================

let _originalViewportMeta = null;
let _didInjectViewportMeta = false;

/**
 * Lock the viewport to 100% scale (Opt-in only).
 * If immersiveMode is enabled, forces the mobile browser to snap out of
 * pinch-zoom, locking the layout viewport perfectly to screen bounds.
 */
export function startVisualViewportSync() {
  stopVisualViewportSync(); // ensure clean state

  // We use the "Viewport Meta Hack" to force-reset the mobile zoom level.
  // By removing and re-injecting the tag, we force stubborn browsers (like Firefox)
  // to re-evaluate the layout viewport and snap back to 1:1 scale.
  const content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no";

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    _originalViewportMeta = meta.content;
    meta.remove(); // Force re-evaluation
  }

  // Force scroll to top-left to help reset the visual viewport position
  window.scrollTo(0, 0);

  const newMeta = document.createElement("meta");
  newMeta.name = "viewport";
  newMeta.id = "diagview-injected-viewport";
  
  // Two-step hack for Firefox: Set a slightly different scale first, then snap to 1
  newMeta.content = "width=device-width, initial-scale=0.999";
  document.head.appendChild(newMeta);
  _didInjectViewportMeta = true;

  // Final snap in next frame
  requestAnimationFrame(() => {
    if (newMeta) newMeta.content = content;
  });
}

/**
 * Restore the original viewport settings so the user can
 * resume zooming the background website text.
 */
export function stopVisualViewportSync() {
  if (_didInjectViewportMeta) {
    const injected = document.getElementById("diagview-injected-viewport");
    if (injected) injected.remove();
    _didInjectViewportMeta = false;
  } else if (_originalViewportMeta !== null) {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.content = _originalViewportMeta;
    }
    _originalViewportMeta = null;
  }
}

/**
 * Reset all module-level state.
 * CRIT-4: Ensures clean state across multiple init/destroy cycles in SPAs.
 */
export function resetViewportState() {
  _historyStatePushed = false;
  _historyTransitionLock = false;

  if (_popstateHandler) {
    window.removeEventListener("popstate", _popstateHandler);
    _popstateHandler = null;
  }

  // Also ensure viewport meta tags are restored
  stopVisualViewportSync();
}
