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
 * APPROACH: "Scale-Free" — position:fixed + exact visual viewport dimensions.
 *
 * We size the modal to the visual viewport (vv.width × vv.height) and
 * position it using vv.offsetLeft/offsetTop with translate3d only — NO
 * scale() transform on the modal.
 *
 * Why this matters:
 * - Panzoom operates in the modal's CSS pixel space. If we counter-scale
 *   the modal (old approach: scale(1/vv.scale)), Panzoom's coordinate
 *   space is inflated, making pan/zoom feel sluggish when the browser
 *   is pinch-zoomed.
 * - Firefox computes pageLeft/pageTop differently from Chrome when using
 *   position:absolute, causing layout shifts. position:fixed with
 *   offsetLeft/offsetTop is consistent across browsers.
 */
export function startVisualViewportSync() {
  const modal = document.getElementById("diagview-modal");
  if (!modal || !window.visualViewport) return;

  // Use position:fixed so the modal is relative to the viewport, not the
  // document. Combined with offsetLeft/offsetTop, this gives us the exact
  // position of the visual viewport within the layout viewport — consistent
  // across Chrome, Firefox, Safari, and Brave.
  modal.style.position = "fixed";
  modal.style.left = "0";
  modal.style.top = "0";
  modal.style.transformOrigin = "0 0";
  modal.style.willChange = "transform, width, height";
  modal.style.zIndex = "2147483647";
  // Clear inset so our explicit left/top/width/height take precedence
  modal.style.right = "auto";
  modal.style.bottom = "auto";

  const sync = () => {
    const vv = window.visualViewport;
    if (!vv) return;

    // Use the visual viewport dimensions directly — NO scale transform.
    // This means the modal's CSS pixel space equals the screen pixel space,
    // so Panzoom operates 1:1 with what the user sees on screen.
    const w = vv.width;
    const h = vv.height;

    // offsetLeft/offsetTop give the visual viewport's offset from the
    // layout viewport origin. With position:fixed, this is exactly
    // the translation we need to keep the modal pinned to the visible area.
    const x = vv.offsetLeft;
    const y = vv.offsetTop;

    modal.style.width = `${w}px`;
    modal.style.height = `${h}px`;
    modal.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Publish the zoom compensation factor as a CSS custom property.
    // UI chrome elements (topbar, FAB) consume this via CSS rules to
    // stay at their design pixel size. Using a custom property (instead
    // of direct style.zoom) ensures that elements created AFTER this
    // sync (e.g. the FAB container) instantly inherit the correct value
    // via CSS cascade — no timing gap, no visual glitch.
    modal.style.setProperty("--dv-zoom-comp", 1 / vv.scale);
  };

  // Sync on resize (zoom) and scroll
  window.visualViewport.addEventListener("resize", sync);
  window.visualViewport.addEventListener("scroll", sync);

  // Initial sync
  sync();

  _viewportSyncCleanup = () => {
    window.visualViewport.removeEventListener("resize", sync);
    window.visualViewport.removeEventListener("scroll", sync);

    // Restore modal styles to CSS defaults (position:fixed; inset:0)
    modal.style.transform = "";
    modal.style.width = "";
    modal.style.height = "";
    modal.style.position = "fixed";
    modal.style.left = "";
    modal.style.top = "";
    modal.style.right = "";
    modal.style.bottom = "";
    modal.style.transformOrigin = "";
    modal.style.willChange = "";

    // Remove zoom compensation property
    modal.style.removeProperty("--dv-zoom-comp");
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
