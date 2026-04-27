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
import { checkPanzoomDependency, isSessionStorageAvailable } from "../core/utils.js";
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
      setTransform: (el, { x, y, scale }) => {
        const angle = state.rotationAngle || 0;
        // Natural Camera Order: Translate LAST (leftmost) so it happens in screen-space.
        el.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`;
      },
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

  const { x, y } = panzoom.getPan();
  const scale = panzoom.getScale();
  const angle = state.rotationAngle || 0;

  // Directly apply the style to bypass the library's internal change detection.
  // This ensures rotation is applied even if x/y/scale haven't changed.
  panzoom.setStyle(
    "transform",
    `translate(${x}px, ${y}px) scale(${scale}) rotate(${angle}deg)`
  );
}

/**
 * Setup viewport interactions for pan/zoom
 */
export function setupViewportInteractions(viewport, element, panzoom) {
  if (!panzoom) return () => {};

  let lastTapTime = 0;

  // Desktop wheel zoom (with input blur and safety check)
  const handleWheel = (e) => {
    if (!state.isModalOpen || !panzoom) return;
    blurActiveElement();

    // Panzoom handles wheel normalization internally for modern versions.
    // Manual normalization with object spread ({...e}) breaks in Firefox
    // because non-enumerable properties are lost.
    panzoom.zoomWithWheel(e);
  };

  // Desktop mouse down (blur inputs when starting to pan)
  const handleMouseDown = () => {
    blurActiveElement();
  };

  // Desktop double-click to reset
  const handleDblClick = () => {
    panzoom.reset({ animate: true, duration: 250 });
  };

  // Mobile touch handlers
  const handleTouchStart = (e) => {
    blurActiveElement();

    if (e.touches.length >= 2) {
      state.touchState.isPinching = true;
      // Note: Panzoom library handles the actual pinch math natively
    }
  };

  const handleTouchMove = (e) => {
    // If using 2 or more fingers, we prevent default to stop the browser from
    // scrolling/gesturing, but we let Panzoom's native listeners handle the math.
    if (e.touches.length >= 2) {
      e.preventDefault();
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

  // Return cleanup function (managed listeners already tracked, this is redundant but kept for compatibility)
  return () => {
    // Cleanup is now handled by lifecycle manager
    // This function is kept for backward compatibility
  };
}

/**
 * Destroy panzoom instance
 */
export function destroyPanzoom(panzoom) {
  if (panzoom && typeof panzoom.destroy === "function") {
    try {
      panzoom.destroy();
    } catch (error) {
      console.warn("DiagView: Error destroying Panzoom", error);
    }
  }
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
const isStorageAvailable = isSessionStorageAvailable();

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
  if (!state.config.rememberZoom || !panzoom || !diagramId || !isStorageAvailable) return;

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
  if (!state.config.rememberZoom || !panzoom || !diagramId || !isStorageAvailable) return false;

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
  if (!isStorageAvailable) return;
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
  if (!isStorageAvailable) return;
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith(ZOOM_STATE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    // Ignore errors
  }
}
