/**
 * DiagView Viewport Management
 * Handles browser history state and viewport layout locking.
 *
 * NOTE: For mobile stability, we use the "Viewport Meta Hack".
 * While this temporarily restricts browser-level zoom (WCAG 1.4.4),
 * it is the industry standard for immersive Full-Screen Lightbox
 * applications (like Google Photos, Instagram Web, PhotoSwipe).
 * The user can dynamically zoom the diagram itself via Panzoom,
 * and turning off browser-zoom guarantees a flawless, native-app-like
 * CSS layout for the modal controls without "runaway" UI bugs.
 *
 * @module ui/viewport
 */

import { state } from "../core/config.js";

// ==========================================
// History State (Mobile Back Button)
// ==========================================

let _historyStatePushed = false;
let _popstateHandler = null;

/**
 * Push a history entry when modal opens.
 */
export function pushModalHistoryState(onBackButton) {
  if (_historyStatePushed) return;

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
      history.back();
    }
  }
}

// ==========================================
// Viewport Lock (Native-App Stability)
// ==========================================

let _originalViewportMeta = null;

/**
 * Lock the viewport to 100% scale.
 * Forces the mobile browser to snap out of pinch-zoom, locking the
 * layout viewport perfectly to the physical screen bounds.
 */
export function startVisualViewportSync() {
  stopVisualViewportSync(); // ensure clean state

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    _originalViewportMeta = meta.content;
    // Force scale reset and disable user scaling
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
  } else {
    // Inject if doesn't exist
    const newMeta = document.createElement("meta");
    newMeta.name = "viewport";
    newMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
    document.head.appendChild(newMeta);
  }
}

/**
 * No-op. Preserved for backward compatibility with modal.js imports.
 */
export function triggerVisualViewportSync() {
  // Layout is naturally constrained by the meta tag lock.
}

/**
 * Restore the original viewport settings so the user can
 * resume zooming the background website text.
 */
export function stopVisualViewportSync() {
  if (_originalViewportMeta !== null) {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.content = _originalViewportMeta;
    }
    _originalViewportMeta = null;
  }
}
