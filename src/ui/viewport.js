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
// Visual Viewport Synchronization (Mobile Zoom Handling)
// ==========================================

let _viewportSyncCleanup = null;

/**
 * Synchronize the modal to the visual viewport.
 * This is the "Best Fix" for satisfying the following requirements:
 * 1. Open diagram in perfect 1:1 scale even if background is zoomed.
 * 2. Persist background zoom and scroll position on close.
 * 3. Work reliably in Firefox, Chrome, Safari, and Brave.
 *
 * It uses the VisualViewport API to "counter-scale" the modal against the
 * background zoom level without modifying the page's viewport meta tag.
 */
export function startVisualViewportSync() {
  const modal = document.getElementById("diagview-modal");
  if (!modal || !window.visualViewport) return;

  // Ensure modal has the correct starting styles for transformation.
  // We use position: absolute relative to document.body to ensure that
  // vv.offsetLeft/Top coordinates are applied accurately across all browsers.
  modal.style.position = "absolute";
  modal.style.left = "0";
  modal.style.top = "0";
  modal.style.transformOrigin = "0 0";
  modal.style.willChange = "transform, width, height";
  modal.style.zIndex = "2147483647";

  const sync = () => {
    const vv = window.visualViewport;
    if (!vv) return;

    // The scale factor to negate the browser's pinch-zoom
    const scale = 1 / vv.scale;

    // We make the modal's base size equal to the layout viewport size
    // so that after scaling by (1/vv.scale) it matches the visual viewport.
    // ⚠️ FIREFOX FIX: We use window.innerHeight for baseHeight to prevent
    // the modal from shrinking when the mobile keyboard opens.
    const baseWidth = vv.width * vv.scale;
    const baseHeight = (window.innerHeight || vv.height) * vv.scale;

    // vv.pageLeft and vv.pageTop are the coordinates of the visual viewport
    // relative to the document. Since the modal is position:absolute
    // at the top of the document, these are the exact coordinates we need.
    const x = vv.pageLeft;
    const y = vv.pageTop;

    modal.style.width = `${baseWidth}px`;
    modal.style.height = `${baseHeight}px`;
    modal.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  };

  // Sync on resize (zoom) and scroll
  window.visualViewport.addEventListener("resize", sync);
  window.visualViewport.addEventListener("scroll", sync);

  // Initial sync
  sync();

  _viewportSyncCleanup = () => {
    window.visualViewport.removeEventListener("resize", sync);
    window.visualViewport.removeEventListener("scroll", sync);

    // Restore modal styles
    modal.style.transform = "";
    modal.style.width = "";
    modal.style.height = "";
    modal.style.position = "";
    modal.style.left = "";
    modal.style.top = "";
  };
}

/**
 * Stop synchronization and cleanup listeners.
 */
export function stopVisualViewportSync() {
  if (_viewportSyncCleanup) {
    _viewportSyncCleanup();
    _viewportSyncCleanup = null;
  }
}

/**
 * Reset all module-level state.
 */
export function resetViewportState() {
  _historyStatePushed = false;
  _historyTransitionLock = false;

  if (_popstateHandler) {
    window.removeEventListener("popstate", _popstateHandler);
    _popstateHandler = null;
  }

  stopVisualViewportSync();
}
