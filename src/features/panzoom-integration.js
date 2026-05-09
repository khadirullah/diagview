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
import { ZOOM, TIMING } from "../core/constants.js";
import { checkPanzoomDependency } from "../core/utils.js";

import { addManagedListener, addModalListener } from "../core/lifecycle.js";
import { showErrorToast, showInfoToast } from "../ui/toast.js";
import { blurActiveElement } from "../ui/focus-manager.js";

/**
 * Check if Panzoom is available
 */
export function isPanzoomAvailable() {
  return checkPanzoomDependency();
}

/**
 * Initialize Panzoom on element
 */
export function initializePanzoom(element, options = {}) {
  if (!isPanzoomAvailable()) {
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
      duration: state.config.zoomAnimationDuration || TIMING.ZOOM_ANIMATION_DURATION,
      noBind: false,
      step: 0.35, // Increased sensitivity for snappier feel (Default is 0.3)
      ...options,
    };

    const panzoom = window.Panzoom(element, panzoomOptions);

    // Notify on zoom change
    if (state.config.onZoomChange) {
      addManagedListener(element, "panzoomchange", (e) => {
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
 * Force a re-render of the current transform
 * This is the proper, non-hacky way to apply external changes like rotation
 */
export function refreshPanzoom(panzoom) {
  if (!panzoom) return;
  // The wrapper pattern (modal.js) handles rotation independently.
  // We just let Panzoom handle its own transforms at 100% speed.
  panzoom.reset();
}

/**
 * Setup viewport interactions for pan/zoom
 */
export function setupViewportInteractions(viewport, element, panzoom) {
  if (!panzoom) return;

  let lastTapTime = 0;

  // Helper to check if text select mode is ON
  const isTextSelectActive = () => viewport.classList.contains("dv-text-select");

  // Desktop wheel zoom (with input blur and safety check)
  const handleWheel = (e) => {
    if (!state.isModalOpen || !panzoom || isTextSelectActive()) return;

    // Prevent the background page from zooming/scrolling while we are zooming the diagram.
    // This is critical for stability in modern browsers when the viewport is not hard-locked.
    if (e.cancelable) e.preventDefault();

    blurActiveElement();

    // Panzoom handles wheel normalization internally for modern versions.
    // Manual normalization with object spread ({...e}) breaks in Firefox
    // because non-enumerable properties are lost.
    panzoom.zoomWithWheel(e);
  };

  // Desktop mouse down (blur inputs when starting to pan)
  const handleMouseDown = () => {
    if (isTextSelectActive()) return;
    blurActiveElement();
  };

  // Desktop double-click to reset
  const handleDblClick = () => {
    if (isTextSelectActive()) return;
    panzoom.reset({ animate: true, duration: 250 });
  };

  // Mobile touch handlers
  const handleTouchStart = (e) => {
    if (isTextSelectActive()) return;
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
    const now = Date.now();
    const gap = now - lastTapTime;

    // Double tap to reset
    if (!state.touchState.isPinching && gap < 300 && gap > 0 && e.touches.length === 0) {
      panzoom.reset({ animate: true, duration: 250 });
      lastTapTime = 0;
    } else if (e.touches.length === 0) {
      lastTapTime = now;
    }

    if (e.touches.length === 0) {
      state.touchState.isPinching = false;
    }
  };

  // Attach event listeners using MODAL listeners (auto-cleanup on close)
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

const ZOOM_STATE_PREFIX = "diagview-zoom-states";

/**
 * Get storage key for diagram
 */
function getZoomKey(diagramId) {
  return `${ZOOM_STATE_PREFIX}:${diagramId}`;
}

/**
 * Save zoom state for a diagram
 */
export function saveZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId || !state.isStorageAvailable) return;

  try {
    const zoomState = {
      scale: panzoom.getScale(),
      pan: panzoom.getPan(),
      rotation: state.rotationAngle,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(getZoomKey(diagramId), JSON.stringify(zoomState));
  } catch (e) {
    // Silently fail if storage is full or restricted
  }
}

/**
 * Restore zoom state for a diagram
 */
export function restoreZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId || !state.isStorageAvailable)
    return false;

  try {
    const stored = sessionStorage.getItem(getZoomKey(diagramId));
    if (!stored) return false;

    const zoomState = JSON.parse(stored);

    // Apply saved state
    state.rotationAngle = zoomState.rotation !== undefined ? zoomState.rotation : 0;
    panzoom.zoom(zoomState.scale, { animate: false });
    panzoom.pan(zoomState.pan.x, zoomState.pan.y, { animate: false });

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clear zoom state for a diagram
 */
export function clearZoomState(diagramId) {
  if (!state.isStorageAvailable) return;
  try {
    sessionStorage.removeItem(getZoomKey(diagramId));
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Clear all zoom states
 */
export function clearAllZoomStates() {
  if (!state.isStorageAvailable) return;
  try {
    const storage = sessionStorage;
    const keys = Object.keys(storage);
    keys.forEach((key) => {
      if (key.startsWith(ZOOM_STATE_PREFIX)) {
        storage.removeItem(key);
      }
    });
  } catch (e) {
    // Ignore errors
  }
}
