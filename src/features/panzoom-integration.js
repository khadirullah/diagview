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
import { addManagedListener } from "../core/lifecycle.js";
import { showErrorToast, showInfoToast } from "../ui/toast.js";
import { blurIfInput } from "../ui/focus-manager.js";

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
 * Setup viewport interactions for pan/zoom
 */
export function setupViewportInteractions(viewport, element, panzoom) {
  if (!panzoom) return () => { };

  let lastTapTime = 0;

  // Desktop wheel zoom (with input blur)
  const handleWheel = (e) => {
    blurIfInput();
    panzoom.zoomWithWheel(e);
  };

  // Desktop mouse down (blur inputs when starting to pan)
  const handleMouseDown = () => {
    blurIfInput();
  };

  // Desktop double-click to reset
  const handleDblClick = () => {
    panzoom.reset({ animate: true, duration: 250 });
  };

  // Mobile touch handlers
  const getDist = (touches) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );

  const handleTouchStart = (e) => {
    blurIfInput();

    state.touchState.lastTouchCount = e.touches.length;
    if (e.touches.length === 2) {
      state.touchState.isPinching = true;
      state.touchState.initialDistance = getDist(e.touches);
      e.preventDefault();
    }
  };

  const handleTouchMove = (e) => {
    if (state.touchState.isPinching && e.touches.length === 2) {
      e.preventDefault();

      const currentDist = getDist(e.touches);
      const scaleDelta = currentDist / state.touchState.initialDistance;

      // Smoother zoom: use smaller lerp factor for more gradual feel
      const currentScale = panzoom.getScale();
      const targetScale = currentScale * scaleDelta;
      const smoothScale = currentScale + (targetScale - currentScale) * 0.15;

      panzoom.zoomToPoint(smoothScale, {
        clientX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        clientY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      });

      state.touchState.initialDistance = currentDist;
    }
  };

  const handleTouchEnd = (e) => {
    const now = Date.now();
    const gap = now - lastTapTime;

    // Double tap to reset
    if (
      !state.touchState.isPinching &&
      gap < 300 &&
      gap > 0 &&
      e.touches.length === 0
    ) {
      panzoom.reset({ animate: true, duration: 250 });
      lastTapTime = 0;
    } else if (e.touches.length === 0) {
      lastTapTime = now;
    }

    if (e.touches.length === 0) {
      state.touchState.isPinching = false;
    }
    state.touchState.lastTouchCount = e.touches.length;
  };

  // Attach event listeners using managed listeners
  addManagedListener(viewport, "wheel", handleWheel, { passive: false });
  addManagedListener(viewport, "mousedown", handleMouseDown, { passive: true });
  addManagedListener(viewport, "dblclick", handleDblClick, { passive: true });
  addManagedListener(viewport, "touchstart", handleTouchStart, { passive: false });
  addManagedListener(viewport, "touchmove", handleTouchMove, { passive: false });
  addManagedListener(viewport, "touchend", handleTouchEnd, { passive: true });

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

const ZOOM_STATE_KEY = "diagview-zoom-states";

/**
 * Get storage key for diagram
 */
function getZoomKey(diagramId) {
  return `${ZOOM_STATE_KEY}:${diagramId}`;
}

/**
 * Save zoom state for a diagram
 */
export function saveZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId) return;

  try {
    const zoomState = {
      scale: panzoom.getScale(),
      pan: panzoom.getPan(),
      timestamp: Date.now()
    };
    sessionStorage.setItem(getZoomKey(diagramId), JSON.stringify(zoomState));
  } catch (e) {
    // sessionStorage may not be available
    console.warn("DiagView: Could not save zoom state", e);
  }
}

/**
 * Restore zoom state for a diagram
 */
export function restoreZoomState(diagramId, panzoom) {
  if (!state.config.rememberZoom || !panzoom || !diagramId) return false;

  try {
    const stored = sessionStorage.getItem(getZoomKey(diagramId));
    if (!stored) return false;

    const zoomState = JSON.parse(stored);

    // Apply saved state
    panzoom.zoom(zoomState.scale, { animate: false });
    panzoom.pan(zoomState.pan.x, zoomState.pan.y, { animate: false });

    return true;
  } catch (e) {
    console.warn("DiagView: Could not restore zoom state", e);
    return false;
  }
}

/**
 * Clear zoom state for a diagram
 */
export function clearZoomState(diagramId) {
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
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(ZOOM_STATE_KEY)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    // Ignore errors
  }
}
