/**
 * DiagView Pan & Zoom Integration
 *
 * DECISION: External integration (using Panzoom library)
 *
 * PROS:
 * - Battle-tested, robust implementation
 * - Handles edge cases (momentum, boundaries, touch gestures)
 * - Regular updates and bug fixes
 * - Smaller bundle size (optional dependency)
 * - Better performance (optimized by specialists)
 *
 * CONS:
 * - External dependency
 * - Less control over implementation
 * - Need to ensure version compatibility
 *
 * CONCLUSION: External integration is better because:
 * 1. Pan/zoom is complex (touch gestures, momentum, boundaries)
 * 2. Panzoom library is small (~5KB gzipped)
 * 3. It's well-maintained and battle-tested
 * 4. We can make it optional (progressive enhancement)
 * 5. Users can swap it for alternatives if needed
 */

import { state } from "../core/config.js";
import { ZOOM, PAN, TIMING } from "../core/constants.js";
import { checkPanzoomDependency } from "../core/utils.js";

import { addModalListener, addModalCleanupFunction } from "../core/lifecycle.js";
import { showErrorToast, showInfoToast } from "../ui/toast.js";
import { blurActiveElement } from "../ui/focus-manager.js";

/**
 * Initialize Panzoom on element
 */
export function initializePanzoom(element, options = {}) {
  if (!checkPanzoomDependency()) {
    console.warn("DiagView: Panzoom library not found. Zoom/pan disabled.");
    showInfoToast("Zoom/pan requires Panzoom library");
    return null;
  }

  try {
    const panzoomOptions = {
      maxScale: state.config.maxZoomScale || ZOOM.MAX_SCALE_DEFAULT,
      minScale: state.config.minZoomScale || ZOOM.MIN_SCALE_DEFAULT,
      canvas: true,
      animate: true,
      duration: state.config.zoomAnimationDuration ?? TIMING.ZOOM_ANIMATION_DURATION,
      noBind: false,
      step: 0.35, // Increased sensitivity for snappier feel (Default is 0.3)
      // Safari drops the click after a touch whose pointerdown was cancelled,
      // so a tap on a link or onclick node would do nothing. Keep the default
      // for the mouse and for everything else. a[*|href] also matches the
      // older xlink:href links.
      handleStartEvent: (e) => {
        if (e.pointerType === "mouse" || !e.target?.closest?.("a[*|href], [onclick]")) {
          e.preventDefault();
        }
        e.stopPropagation();
      },
      ...options,
    };

    const panzoom = window.Panzoom(element, panzoomOptions);

    // Notify on zoom change. Modal-scoped: a new panzoom instance (and a new
    // cloned element) is created on every modal open, so a destroy-scoped
    // listener would pin each discarded clone in memory until destroy().
    if (state.config.onZoomChange) {
      addModalListener(element, "panzoomchange", (e) => {
        // A turn changes no zoom. Panzoom's own event reports any new scale.
        if (e.detail?.isRotation) return;
        state.config.onZoomChange(e.detail.scale);
      });
    }

    return panzoom;
  } catch (error) {
    console.error("DiagView: Failed to initialize Panzoom", error);
    showErrorToast("Zoom initialization failed");
    return null;
  }
}

/**
 * Setup viewport interactions for pan/zoom
 */
export function setupViewportInteractions(viewport, element, panzoom) {
  if (!panzoom) return;

  let lastTapTime = 0;

  // Helper to check if text select mode is ON
  const isTextSelectActive = () => viewport.classList.contains("dv-text-select");

  // Gesture-scoped compositor-layer promotion.
  // A permanent will-change:transform makes browsers cache the SVG as a
  // fixed-resolution texture, so zooming stretches a bitmap and diagrams go
  // blurry (worst on mobile, where texture budgets are small). Without any
  // hint, Firefox re-rasterizes the SVG on every pan frame and janks.
  // Compromise: promote only WHILE a gesture is active, then drop the hint
  // shortly after it ends so the browser re-rasterizes the vectors at the
  // final scale — smooth during interaction, sharp at rest, on every engine.
  const WILL_CHANGE_COOLDOWN = 400;
  let willChangeTimer = null;
  const armWillChange = () => {
    if (willChangeTimer) {
      clearTimeout(willChangeTimer);
    } else {
      element.style.willChange = "transform";
    }
    willChangeTimer = setTimeout(() => {
      willChangeTimer = null;
      element.style.willChange = "";
    }, WILL_CHANGE_COOLDOWN);
  };
  addModalCleanupFunction(() => {
    if (willChangeTimer) clearTimeout(willChangeTimer);
    willChangeTimer = null;
    element.style.willChange = "";
  });
  // panzoomchange covers every transform source: drag, pinch, wheel,
  // keyboard pans, zoom buttons, and programmatic zooms.
  addModalListener(element, "panzoomchange", armWillChange);

  // Desktop wheel zoom (with input blur and safety check)
  const handleWheel = (e) => {
    if (!state.isModalOpen || !panzoom || isTextSelectActive()) return;

    // Prevent the background page from zooming/scrolling while we are zooming the diagram.
    // This is critical for stability in modern browsers when the viewport is not hard-locked.
    if (e.cancelable) e.preventDefault();

    armWillChange();
    blurActiveElement();

    // Panzoom handles wheel normalization internally for modern versions.
    // Manual normalization with object spread ({...e}) breaks in Firefox
    // because non-enumerable properties are lost.
    panzoom.zoomWithWheel(e);
  };

  // Desktop mouse down (blur inputs when starting to pan)
  const handleMouseDown = () => {
    if (isTextSelectActive()) return;
    armWillChange();
    blurActiveElement();
  };

  // Desktop double-click to reset. Reset takes zoomAnimationDuration from
  // the Panzoom options, as the other resets do.
  const handleDblClick = () => {
    if (isTextSelectActive()) return;
    panzoom.reset({ animate: true });
  };

  // Mobile touch handlers
  const handleTouchStart = (e) => {
    if (isTextSelectActive()) return;
    armWillChange();
    blurActiveElement();

    if (e.touches.length >= 2) {
      state.touchState.isPinching = true;
    }
  };

  const handleTouchMove = (e) => {
    // If using 2 or more fingers, we prevent default to stop the browser from
    // scrolling/gesturing, but we let Panzoom's native listeners handle the math.
    if (e.touches.length >= 2) {
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length !== 0) return;

    // The last finger of a pinch lifting is not a tap: end the pinch and
    // forget any pending tap so the next single tap cannot complete a
    // "double tap" and reset the zoom the user just pinched to.
    if (state.touchState.isPinching) {
      state.touchState.isPinching = false;
      lastTapTime = 0;
      return;
    }

    const now = Date.now();
    const gap = now - lastTapTime;

    // Double tap to reset
    if (gap < 300 && gap > 0) {
      panzoom.reset({ animate: true });
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  };

  // A pan that starts and ends on a link would open it. The diagram moves
  // with the pointer, so the release lands on the same element and the
  // browser fires a click. Swallow the one click that follows a drag.
  // Capture phase on the viewport runs before Panzoom's own pointerdown
  // handler and before any link or onclick handler inside the SVG.
  let downX = 0;
  let downY = 0;
  let dragged = false;
  const handlePointerDown = (e) => {
    if (!e.isPrimary) return;
    downX = e.clientX;
    downY = e.clientY;
    dragged = false;
  };
  const handlePointerUp = (e) => {
    if (!e.isPrimary) return;
    dragged = Math.hypot(e.clientX - downX, e.clientY - downY) > PAN.DRAG_CLICK_THRESHOLD;
  };
  const handleClickCapture = (e) => {
    // detail 0 means a keyboard or scripted click, which no drag produced.
    if (!dragged || e.detail === 0) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Attach event listeners using MODAL listeners (auto-cleanup on close)
  addModalListener(viewport, "pointerdown", handlePointerDown, true);
  addModalListener(viewport, "pointerup", handlePointerUp, true);
  addModalListener(viewport, "click", handleClickCapture, true);
  addModalListener(viewport, "wheel", handleWheel, { passive: false });
  addModalListener(viewport, "mousedown", handleMouseDown, { passive: true });
  addModalListener(viewport, "dblclick", handleDblClick, { passive: true });
  addModalListener(viewport, "touchstart", handleTouchStart, { passive: false });
  addModalListener(viewport, "touchmove", handleTouchMove, { passive: false });
  addModalListener(viewport, "touchend", handleTouchEnd, { passive: true });

  // All listeners use addModalListener — they are cleaned up automatically
  // when the modal closes via runModalCleanupFunctions(). No return needed.
}

/**
 * Reset touch state
 */
export function resetTouchState() {
  state.touchState = {
    isPinching: false,
    lastTouchCount: 0,
    initialDistance: 0,
  };
}

// ==========================================
// Remember Zoom State
// ==========================================

// Kept in memory only. Diagram ids are new on every page load, so a saved
// view could never be matched after a reload anyway.
const zoomStates = new Map();

/**
 * Save zoom state for a diagram
 */
export function saveZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId) return;

  const pan = panzoom.getPan();
  zoomStates.set(diagramId, {
    scale: panzoom.getScale(),
    pan: { x: pan.x, y: pan.y },
    rotation: state.rotationAngle,
  });
}

/**
 * Restore zoom state for a diagram
 */
export function restoreZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId) return false;

  try {
    const zoomState = zoomStates.get(diagramId);
    if (!zoomState) return false;

    // Apply saved state. The saved pan/scale were captured with the rotation
    // applied (rotate.js rewrites the viewBox), so the rotation must be
    // re-APPLIED to the DOM first — writing state.rotationAngle alone rotates
    // nothing and leaves the minimap rotated over an unrotated diagram.
    const { rotation } = zoomState;
    const applyZoomAndPan = () => {
      if (!state.isModalOpen || state.activePanzoom !== panzoom) return;
      panzoom.zoom(zoomState.scale, { animate: false });
      // Panzoom's constructor schedules pan(startX, startY, {force: true}) on
      // a 0ms timer; a pan applied before that fires is reset to (0,0) while
      // the scale is kept. Queue the restored pan as a later macrotask.
      setTimeout(() => {
        if (!state.isModalOpen || state.activePanzoom !== panzoom) return;
        panzoom.pan(zoomState.pan.x, zoomState.pan.y, { animate: false });
      });
    };
    if (rotation !== 0) {
      import("./lazy/rotate.js")
        .then((m) => {
          if (state.isModalOpen) m.applyRotationAngle(rotation);
        })
        .catch(() => {
          state.rotationAngle = 0;
        })
        .then(applyZoomAndPan);
    } else {
      state.rotationAngle = 0;
      applyZoomAndPan();
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clear all zoom states
 */
export function clearAllZoomStates() {
  zoomStates.clear();
}
