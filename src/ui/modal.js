/**
 * DiagView Modal Component
 * OPTIMIZED with proper cleanup and no circular dependencies
 * @module ui/modal
 */

import { state } from "../core/config.js";
import { syncTheme } from "../core/theme.js";
import { throttle, centerSVGViewBox, generateUniqueId, getDiagramSvg } from "../core/utils.js";
import { addModalListener, addModalCleanupFunction, loadChunk } from "../core/lifecycle.js";
import { cloneSVGForModal } from "../core/svg-clone.js";
import { TIMING } from "../core/constants.js";
import {
  initializePanzoom,
  setupViewportInteractions,
  resetTouchState,
  saveZoomState,
  restoreZoomState,
} from "../features/panzoom-integration.js";
import { setupModalFocusManagement, saveFocus, setInitialFocus } from "./focus-manager.js";
import { closeModal, lockBodyScroll } from "./modal-controls.js";
import { createFloatingMenu } from "./floating-menu.js";
import { pushModalHistoryState, startVisualViewportSync } from "./viewport.js";
import { showMenuHint } from "./toast.js";
import { getPendingShareState } from "../features/share-state.js";
import { syncCanvasGrid, updateCanvasGrid } from "./canvas-grid.js";

export { createModal } from "./modal-dom.js";

/** Debounce for persisting zoom state on high-frequency panzoomchange (ms) */
const ZOOM_SAVE_DEBOUNCE = 150;

/**
 * Monotonic open-session token. openFullscreen captures it before its awaits
 * and bails out afterwards if a close (or a newer open) happened meanwhile.
 * @type {number}
 */
let _openSession = 0;

/**
 * Whether the open session identified by `token` is still the live one:
 * no newer open has started and no close has begun in the meantime.
 * @private
 * @param {number} token - Session token captured at the start of openFullscreen
 * @returns {boolean} True while that session is still the current one
 */
function _isSessionLive(token) {
  return token === _openSession && state.isModalOpen && !state.isModalClosing;
}

/**
 * PHASE 1: Content Preparation
 * Clones the original SVG and prepares the viewport for injection.
 * @private
 */
function _prepareViewportContent(originalSvg, viewport) {
  const clone = cloneSVGForModal(originalSvg);
  // Over the size limit or unparseable. cloneSVG has already told the user,
  // so leave the viewport as it is and let the caller stop.
  if (!clone) return null;
  viewport.replaceChildren();

  // Implement the 'Wrapper Pattern' for perfect performance
  // Viewport (Static) -> Rotator (Rotates) -> SVG (Pans/Zooms)
  const rotator = document.createElement("div");
  rotator.id = "diagview-rotator";
  rotator.className = "diagview-rotator";

  // FULLY DYNAMIC: Use 100% to support any screen size (640, 1320, 1920, etc.)
  // Apply rotation to the WRAPPER, not the SVG.
  // This keeps Panzoom speed at 100% and mouse directions perfect.
  // We use translate(-50%, -50%) to keep it pinned to the exact center.
  rotator.style.width = "100%";
  rotator.style.height = "100%";
  rotator.style.position = "absolute";
  rotator.style.top = "50%";
  rotator.style.left = "50%";
  rotator.style.transform = `translate(-50%, -50%) rotate(${state.rotationAngle}deg)`;
  rotator.style.display = "flex";
  rotator.style.alignItems = "center";
  rotator.style.justifyContent = "center";
  rotator.style.transition = "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

  clone.style.backgroundColor = "transparent";
  rotator.appendChild(clone);
  viewport.appendChild(rotator);

  return clone;
}

/**
 * The element the viewer must sit in to be seen. While a page element is in
 * the browser's fullscreen, the browser draws only that element and what is
 * inside it, so a viewer left on <body> would open unseen.
 * @private
 * @returns {Element|null} The fullscreen element, or null when the viewer can stay on <body>
 */
function _fullscreenHost() {
  const host = document.fullscreenElement;
  if (!host || host === document.documentElement || host === document.body) return null;
  // A shadow host shows its shadow tree and these elements show no children,
  // so the viewer would be as hidden inside them as outside
  if (host.shadowRoot || /^(VIDEO|AUDIO|IFRAME|IMG|CANVAS|OBJECT|EMBED)$/.test(host.tagName)) {
    return null;
  }
  return host;
}

/**
 * PHASE 2: UI Activation
 * Handles modal visibility, body scroll-locking, and history state.
 * @private
 */
function _activateModalUI(modal, viewport) {
  // Sit inside a page element that is in the browser's fullscreen, and go
  // back to <body> when the viewer closes
  const host = _fullscreenHost();
  if (host && modal.parentNode !== host) {
    host.appendChild(modal);
    addModalCleanupFunction(() => document.body.appendChild(modal));
  }

  // 0. Sync UI elements to visual viewport BEFORE locking body
  // Handles pinch-zoomed browsers by force-resetting scale.
  startVisualViewportSync();

  // Set up focus management on every open. Its teardown runs as modal-scoped
  // cleanup on every close, while the modal DOM is built only once.
  setupModalFocusManagement();

  // Save current focus and sync theme
  saveFocus();
  syncTheme();

  // Open modal with animation if enabled
  modal.classList.add("open");
  if (state.config.animateOpen) {
    modal.classList.add("animate-open");
  }

  // Prevent background scrolling
  lockBodyScroll();
  state.isModalOpen = true;

  // Show first-time canvas theme hint toast if enabled and not previously shown
  if (state.config.showFirstTimeThemeHint) {
    try {
      if (state.isStorageAvailable && !localStorage.getItem("diagview-canvas-hint-shown")) {
        localStorage.setItem("diagview-canvas-hint-shown", "true");
        // A callout above the menu button. Working with the diagram closes it.
        showMenuHint(
          "Having visibility issues?\nChange the canvas theme from the menu ☰",
          viewport,
        );
      }
    } catch (_e) {
      // Ignore storage errors
    }
  }

  // Set initial focus (use rAF to ensure modal is rendered and visible).
  // Modal-scoped so a close that lands before the frame cancels it; otherwise
  // it would fire after restoreFocus and pull focus back into the closed modal.
  const focusFrame = requestAnimationFrame(() => {
    if (state.isModalOpen && !state.isModalClosing) setInitialFocus();
  });
  addModalCleanupFunction(() => cancelAnimationFrame(focusFrame));

  // Push history state so mobile back button closes modal
  pushModalHistoryState(() => closeModal());

  // The viewer never enters the browser's fullscreen, but the page may be
  // in it. Esc there leaves fullscreen before any key handler sees it, so
  // close the viewer too, as the reader asked.
  addModalListener(document, "fullscreenchange", () => {
    if (!document.fullscreenElement && state.isModalOpen) {
      closeModal();
    }
  });
}

/**
 * PHASE 3: Core Interactions
 * Initializes Panzoom and handles initial zoom/search state.
 * @private
 * @returns {Promise<{panzoom: any, diagramId: string}>} The initialized panzoom instance and diagram ID.
 */
async function _initCoreInteractions(element, clone, viewport, options, session) {
  // Calculate diagram index for share links
  // MAJ-7: Use cached index to avoid expensive global DOM queries
  const diagramIndex = parseInt(element.dataset.diagviewIndex ?? "-1", 10);
  state.currentDiagramIndex = diagramIndex >= 0 ? diagramIndex : 0;

  // Reset touch state
  resetTouchState();

  // Initialize panzoom
  const panzoom = initializePanzoom(clone);
  state.activePanzoom = panzoom;

  // Get diagram ID for zoom state. A diagram opened by code before it
  // scrolled into view has no id yet, so give it one init will keep.
  if (!element.dataset.diagviewId && element.dataset.diagviewIndex) {
    element.dataset.diagviewId = generateUniqueId();
  }
  const diagramId = element.dataset.diagviewId;

  // Apply explicit zoom from options (overrides Auto-Fit/Restore)
  if (panzoom && options.zoom && typeof options.zoom === "number") {
    panzoom.zoom(options.zoom, { animate: false });
  }

  if (panzoom) {
    let searchSetUp = false;
    try {
      // Only a share link's view needs the share chunk, so other opens do
      // not wait for it. A share chunk that fails to load leaves the
      // remembered view and the search to work as if there were no link.
      const pending = getPendingShareState(element);
      const [shareMod, searchMod] = await Promise.all([
        pending
          ? loadChunk("share link", () => import("../features/lazy/share.js")).catch(() => null)
          : null,
        loadChunk("search", () => import("../features/lazy/search.js")),
      ]);

      // Guard: If the user closed the modal while we were loading, bail out
      if (!_isSessionLive(session)) return { panzoom, diagramId };

      const query = options.searchQuery ?? pending?.query ?? "";

      // If we have a share link, apply it. Otherwise fallback to remembered zoom.
      // (Only apply if explicit zoom was NOT provided)
      if (shareMod && !options.zoom) {
        shareMod.applyRestoredViewState(element, panzoom);
      } else if (!options.zoom) {
        let restored = false;
        if (diagramId) {
          restored = restoreZoomState(diagramId, panzoom);
        }

        // If no state was restored (first time open), just ensure we are at a clean 1x
        if (!restored) {
          panzoom.zoom(1, { animate: false });
          panzoom.pan(0, 0, { animate: false });
        }
      }

      // Initialize search
      searchSetUp = true;
      searchMod.setupSearch(clone, query);
    } catch (err) {
      console.warn("DiagView: Failed to load lazy features", err);
    }

    // Search is set up once, so a failure after setupSearch must not run it
    // again. Two sets of handlers made Enter skip every other match.
    if (!searchSetUp) {
      try {
        const m = await loadChunk("search", () => import("../features/lazy/search.js"));
        if (_isSessionLive(session)) m.setupSearch(clone);
      } catch (e) {
        // Silent fallback: Search failure is non-critical for core viewing
      }
    }

    // Task 48: Sync minimap after zoom restore to avoid visual lag
    try {
      const m = await loadChunk("minimap", () => import("../features/lazy/minimap.js"));
      if (_isSessionLive(session)) m.updateMinimap(clone, viewport, panzoom);
    } catch (e) {
      // The viewer works without the minimap
    }
  }

  return { panzoom, diagramId };
}

/**
 * PHASE 4: Lifecycle Management
 * Sets up interactions, minimap, and resize listeners.
 * @private
 */
function _attachModalLifecycle(element, clone, viewport, panzoom, diagramId) {
  // Setup viewport interactions
  if (panzoom) {
    setupViewportInteractions(viewport, clone, panzoom);

    // Save zoom state on changes. "panzoomend" only fires on pointer-up, so
    // wheel, keyboard and button zooms were never persisted. "panzoomchange"
    // covers every transform source; debounce it so a wheel burst does one
    // write, and flush once more synchronously when the session closes.
    if (diagramId && state.config.rememberZoom) {
      let saveTimer = null;
      const saveState = () => saveZoomState(diagramId, panzoom);
      addModalListener(clone, "panzoomchange", () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          if (state.isModalOpen) saveState();
        }, ZOOM_SAVE_DEBOUNCE);
      });
      addModalCleanupFunction(() => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        saveState();
      });
    }
  }

  // Dot grid. Not throttled, so the dots move in the same frame as the diagram.
  syncCanvasGrid();
  if (panzoom) {
    addModalListener(clone, "panzoomchange", (e) => updateCanvasGrid(viewport, e.detail, clone));
  }

  // Create floating menu
  createFloatingMenu(element, clone);

  // --- Consolidated UI Sync ---
  if (panzoom) {
    const zoomDisplay = document.getElementById("diagview-zoom-display");
    const zoomTag = document.getElementById("dv-zoom-tag");

    // 1. Throttled updates (Minimap)
    // An update that lands after a close, or after a close and a new open,
    // must do nothing. It would attach click handlers for the old panzoom,
    // and the next session's minimap would keep them.
    let updateMinimapFn = null;
    loadChunk("minimap", () => import("../features/lazy/minimap.js"))
      .then((m) => {
        const updateThisSession = () => {
          if (state.isModalOpen && state.activePanzoom === panzoom) {
            m.updateMinimap(clone, viewport, panzoom);
          }
        };
        updateMinimapFn = throttle(updateThisSession, TIMING.MINIMAP_THROTTLE);
        requestAnimationFrame(updateThisSession);
      })
      .catch(() => {});

    // 2. Immediate updates (Zoom text)
    const syncUI = (e) => {
      // CRIT-1: Guard against trailing throttle fires after modal close
      if (!state.isModalOpen || !panzoom) return;

      const scale = e?.detail?.scale ?? panzoom.getScale();
      const percent = Math.round(scale * 100) + "%";

      // DOM-5: Use pre-cached references instead of querying the DOM in a 60fps loop
      if (zoomDisplay) zoomDisplay.textContent = percent;
      if (zoomTag) zoomTag.textContent = percent;

      // Trigger throttled minimap
      if (updateMinimapFn) updateMinimapFn();
    };

    // EVT-3: Throttle UI sync to prevent layout thrashing on high-frequency events
    const throttledSyncUI = throttle(syncUI, TIMING.UI_SYNC_THROTTLE);

    addModalListener(clone, "panzoomchange", (e) => {
      // Scale is needed immediately for some logic, but DOM updates can be throttled
      throttledSyncUI(e);
    });

    // CRIT-1: Register cancel for cleanup to prevent stale fires
    addModalCleanupFunction(() => throttledSyncUI.cancel());

    syncUI();
  }

  // Auto-fit on significant viewport resize
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;

  const handleResize = throttle(() => {
    // MAJ-5: Use live state references and double-guard inside RAF to prevent
    // execution on stale/destroyed panzoom instances during modal close.
    if (!state.isModalOpen || !state.activePanzoom) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const widthChange = Math.abs(w - lastWidth) / lastWidth;
    const heightChange = Math.abs(h - lastHeight) / lastHeight;

    if (widthChange > 0.2 || heightChange > 0.2) {
      lastWidth = w;
      lastHeight = h;
      requestAnimationFrame(() => {
        // Guard again inside the frame to handle rapid close transitions
        if (!state.isModalOpen || !state.activePanzoom) return;
        state.activePanzoom.reset({ animate: true });
      });
    }
  }, 300);

  addModalListener(window, "resize", handleResize);
  addModalCleanupFunction(() => handleResize.cancel());
}

/**
 * Open fullscreen modal
 *
 * No-op while a session is already open or opening: the open sequence is
 * not re-entrant (it would stash the already-overridden scroll-behavior,
 * leak the first visualViewport listeners and orphan the first Panzoom
 * instance). To switch diagrams, `await closeModal()` first, then open.
 *
 * @param {HTMLElement|SVGSVGElement} element - Diagram container element, or the diagram's <svg>
 * @param {object} [options={}] - Optional overrides
 * @param {number} [options.zoom] - Initial zoom scale to apply after opening
 * @param {string} [options.searchQuery] - Pre-fill the search input with this query
 */
export async function openFullscreen(element, options = {}) {
  // CRIT-3: Prevent concurrent execution of openFullscreen
  if (state.isModalOpening || state.isModalOpen) return;

  const originalSvg = getDiagramSvg(element);
  if (!originalSvg) return;

  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");
  if (!modal || !viewport) return;

  state.isModalOpening = true;
  const session = ++_openSession;

  try {
    state.activeSourceElement = element;
    // Phase 1: Preparation
    const clone = _prepareViewportContent(originalSvg, viewport);
    if (!clone) {
      state.activeSourceElement = null;
      return;
    }

    // Cover the diagram while the lazy features load, on every open. The
    // closed modal is not displayed, so the cover shows at once, not faded in.
    const loading = document.getElementById("diagview-loading");
    if (loading) loading.classList.remove("hide");

    // Phase 2: UI Activation
    _activateModalUI(modal, viewport);

    // RE-CENTER: Now that the modal is visible (classList 'open' applied),
    // the browser can accurately calculate BBox for diagrams that extend
    // beyond their original viewBox (fixes clipping at the bottom).
    centerSVGViewBox(clone);

    // Phase 3: Core Interactions
    const { panzoom, diagramId } = await _initCoreInteractions(
      element,
      clone,
      viewport,
      options,
      session,
    );

    // A close (or a newer open) may have started while we were awaiting:
    // closeModal has already run the modal-scoped cleanups, so anything
    // registered from here on would outlive the session. Bail out.
    if (!_isSessionLive(session)) return;

    // Phase 4: Lifecycle
    _attachModalLifecycle(element, clone, viewport, panzoom, diagramId);

    // Readable text lasts for the page session, so every new clone gets it.
    // The modal is open and laid out by now, so labels can be measured.
    if (state.readableText) {
      loadChunk("readable text", () => import("../features/lazy/readable-text.js"))
        .then((m) => m.syncReadableText())
        .catch(() => {});
    }

    // Completion UI
    requestAnimationFrame(() => {
      if (loading) loading.classList.add("hide");
    });

    // Callbacks
    if (state.config.onOpen) {
      try {
        state.config.onOpen();
      } catch (e) {
        console.error("DiagView: onOpen callback error:", e);
      }
    }
  } finally {
    // A newer open may already be in flight; only the live session owns the flag
    if (session === _openSession) state.isModalOpening = false;
  }
}
