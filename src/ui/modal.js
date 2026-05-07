/**
 * DiagView Modal Component
 * OPTIMIZED with proper cleanup and no circular dependencies
 * @module ui/modal
 */

import { state } from "../core/config.js";
import { detectTheme, syncTheme } from "../core/theme.js";
import { throttle, setSVGContent, centerSVGViewBox } from "../core/utils.js";
import { addModalListener, addModalCleanupFunction } from "../core/lifecycle.js";
import { cloneSVGForModal } from "../core/svg-clone.js";
import { BRANDING, TIMING } from "../core/constants.js";
import { ICONS } from "./icons.js";
import {
  initializePanzoom,
  setupViewportInteractions,
  resetTouchState,
  saveZoomState,
  restoreZoomState,
} from "../features/panzoom-integration.js";
import {
  setupModalFocusManagement,
  saveFocus,
  setInitialFocus,
  invalidateFocusableCache,
} from "./focus-manager.js";
import { closeModal, lockBodyScroll } from "./modal-controls.js";
import { createFloatingMenu } from "./floating-menu.js";
import { pushModalHistoryState, startVisualViewportSync } from "./viewport.js";

/**
 * Create modal structure
 */
export function createModal() {
  if (document.getElementById("diagview-modal")) return;

  const theme = detectTheme();
  const modal = document.createElement("div");
  modal.id = "diagview-modal";
  modal.className = "diagview-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Diagram viewer");
  modal.tabIndex = -1; // Allows silent focus capture

  modal.style.backgroundColor = theme.bg;

  // 1. Loading Indicator
  const loading = document.createElement("div");
  loading.className = "diagview-loading";
  loading.id = "diagview-loading";
  const spinner = document.createElement("div");
  spinner.className = "diagview-spinner";
  loading.appendChild(spinner);
  modal.appendChild(loading);

  // 2. Modal Content
  const content = document.createElement("div");
  content.className = "diagview-modal-content";
  modal.appendChild(content);

  // 3. Topbar Construction
  const {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    searchClear,
    textSelectDesktopBtn,
    closeBtn,
  } = _createModalTopbar(content);

  // 4. Viewport
  // 4. Main Content Construction (Viewport, Minimap, Laser)
  const { viewport } = _createModalMainContent(modal, content);

  // Setup focus management
  setupModalFocusManagement();

  // 5. Wire Events
  _wireModalEvents(
    {
      topbar,
      searchIconBtn,
      textSelectMobileBtn,
      searchBackBtn,
      searchInput,
      searchClear,
      textSelectDesktopBtn,
      closeBtn,
    },
    viewport,
  );
}

/**
 * PHASE 1: Content Preparation
 * Clones the original SVG and prepares the viewport for injection.
 * @private
 */
function _prepareViewportContent(originalSvg, viewport) {
  const clone = cloneSVGForModal(originalSvg);
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
 * PHASE 2: UI Activation
 * Handles modal visibility, body scroll-locking, and history state.
 * @private
 */
function _activateModalUI(modal) {
  // 0. Sync UI elements to visual viewport BEFORE locking body
  // Handles pinch-zoomed browsers by force-resetting scale.
  startVisualViewportSync();

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

  // Set initial focus (use rAF to ensure modal is rendered and visible)
  requestAnimationFrame(() => {
    setInitialFocus();
  });

  // Push history state so mobile back button closes modal
  pushModalHistoryState(() => closeModal());

  // Sync modal with native fullscreen exits
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
 * @returns {Promise<{panzoom: any, diagramId: string}>}
 */
async function _initCoreInteractions(element, clone, viewport, options) {
  // Calculate diagram index for share links
  // MAJ-7: Use cached index to avoid expensive global DOM queries
  const diagramIndex = parseInt(element.dataset.diagviewIndex ?? "-1", 10);
  state.currentDiagramIndex = diagramIndex >= 0 ? diagramIndex : 0;

  // Reset touch state
  resetTouchState();

  // Initialize panzoom
  const panzoom = initializePanzoom(clone);
  state.activePanzoom = panzoom;

  // Get diagram ID for zoom state
  const diagramId = element.dataset.diagviewId;

  // Apply explicit zoom from options (overrides Auto-Fit/Restore)
  if (panzoom && options.zoom && typeof options.zoom === "number") {
    panzoom.zoom(options.zoom, { animate: false });
  }

  if (panzoom) {
    try {
      const [shareMod, searchMod] = await Promise.all([
        import("../features/lazy/share.js"),
        import("../features/lazy/search.js"),
      ]);

      // Guard: If the user closed the modal while we were loading, bail out
      if (!state.isModalOpen) return { panzoom, diagramId };

      const pending = shareMod.getPendingShareState(element);
      const query = options.searchQuery ?? pending?.query ?? "";

      // If we have a share link, apply it. Otherwise fallback to remembered zoom.
      // (Only apply if explicit zoom was NOT provided)
      if (pending && !options.zoom) {
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
      searchMod.setupSearch(clone, query);

      // Task 48: Sync minimap after zoom restore to avoid visual lag
      const m = await import("../features/lazy/minimap.js");
      if (state.isModalOpen) m.updateMinimap(clone, viewport, panzoom);
    } catch (err) {
      console.warn("DiagView: Failed to load lazy features", err);
      // Fallback: at least try to setup search if one failed
      try {
        const m = await import("../features/lazy/search.js");
        m.setupSearch(clone);
      } catch (e) {
        // Silent fallback: Search failure is non-critical for core viewing
      }
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

    // Save zoom state on changes
    if (diagramId && state.config.rememberZoom) {
      const saveState = () => saveZoomState(diagramId, panzoom);
      addModalListener(clone, "panzoomend", saveState);
    }
  }

  // Create floating menu
  createFloatingMenu(element, clone);

  // --- Consolidated UI Sync ---
  if (panzoom) {
    const zoomDisplay = document.getElementById("diagview-zoom-display");
    const zoomTag = document.getElementById("dv-zoom-tag");

    // 1. Throttled updates (Minimap)
    let updateMinimapFn = null;
    import("../features/lazy/minimap.js")
      .then((m) => {
        updateMinimapFn = throttle(() => {
          if (state.isModalOpen) m.updateMinimap(clone, viewport, panzoom);
        }, TIMING.MINIMAP_THROTTLE);
        requestAnimationFrame(() => m.updateMinimap(clone, viewport, panzoom));
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
    const throttledSyncUI = throttle(syncUI, TIMING.UI_SYNC_THROTTLE || 32);

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
        state.activePanzoom.reset({ animate: true, duration: 300 });
      });
    }
  }, 300);

  addModalListener(window, "resize", handleResize);
  addModalCleanupFunction(() => handleResize.cancel());
}

/**
 * Open fullscreen modal
 * @param {HTMLElement} element - Diagram container element
 * @param {object} [options={}] - Optional overrides
 * @param {number} [options.zoom] - Initial zoom scale to apply after opening
 * @param {string} [options.searchQuery] - Pre-fill the search input with this query
 */
export async function openFullscreen(element, options = {}) {
  // CRIT-3: Prevent concurrent execution of openFullscreen
  if (state.isModalOpening) return;

  const originalSvg = element.querySelector("svg");
  if (!originalSvg) return;

  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");
  if (!modal || !viewport) return;

  state.isModalOpening = true;

  try {
    state.activeSourceElement = element;
    // Phase 1: Preparation
    const clone = _prepareViewportContent(originalSvg, viewport);

    // Phase 2: UI Activation
    _activateModalUI(modal);

    // RE-CENTER: Now that the modal is visible (classList 'open' applied),
    // the browser can accurately calculate BBox for diagrams that extend
    // beyond their original viewBox (fixes clipping at the bottom).
    centerSVGViewBox(clone);

    // Phase 3: Core Interactions
    const { panzoom, diagramId } = await _initCoreInteractions(element, clone, viewport, options);

    // Phase 4: Lifecycle
    _attachModalLifecycle(element, clone, viewport, panzoom, diagramId);

    // Completion UI
    const loading = document.getElementById("diagview-loading");
    if (loading) loading.classList.remove("hide");

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
    state.isModalOpening = false;
  }
}
/**
 * Create the modal topbar and its interactive elements
 * @private
 * @param {HTMLElement} content - Modal content container
 */
function _createModalTopbar(content) {
  const topbar = document.createElement("div");
  topbar.className = "diagview-topbar";
  content.appendChild(topbar);

  // ── Mobile icon action row ──────────────────
  const mobileActions = document.createElement("div");
  mobileActions.className = "dv-topbar-actions";

  const searchIconBtn = document.createElement("button");
  searchIconBtn.id = "dv-search-icon-btn";
  searchIconBtn.className = "dv-icon-btn";
  searchIconBtn.setAttribute("aria-label", "Search diagram");
  searchIconBtn.setAttribute("aria-expanded", "false");
  searchIconBtn.setAttribute("type", "button");
  setSVGContent(searchIconBtn, ICONS.search);

  const textSelectMobileBtn = document.createElement("button");
  textSelectMobileBtn.id = "dv-text-select-btn";
  textSelectMobileBtn.className = "dv-icon-btn dv-hide-on-search";
  textSelectMobileBtn.setAttribute("aria-label", "Toggle text select — copy SVG node labels");
  textSelectMobileBtn.setAttribute("aria-pressed", "false");
  textSelectMobileBtn.setAttribute("type", "button");
  setSVGContent(textSelectMobileBtn, ICONS.textSelect);

  mobileActions.append(searchIconBtn, textSelectMobileBtn);
  topbar.appendChild(mobileActions);

  // Branding
  const brandingLink = document.createElement("a");
  brandingLink.href = BRANDING.URL;
  brandingLink.target = "_blank";
  brandingLink.className = "diagview-branding";
  brandingLink.title = `${BRANDING.LABEL} by Khadirullah`;
  brandingLink.textContent = BRANDING.LABEL;
  topbar.appendChild(brandingLink);

  // Search Container
  const searchContainer = document.createElement("div");
  searchContainer.className = "diagview-search-container";
  const searchWrapper = document.createElement("div");
  searchWrapper.className = "diagview-search-wrapper";
  searchContainer.appendChild(searchWrapper);

  const searchBackBtn = document.createElement("button");
  searchBackBtn.id = "diagview-search-back";
  searchBackBtn.className = "diagview-search-back";
  searchBackBtn.setAttribute("aria-label", "Exit search");
  searchBackBtn.setAttribute("type", "button");
  setSVGContent(
    searchBackBtn,
    ICONS.back ||
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  );
  searchWrapper.appendChild(searchBackBtn);

  const searchIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  searchIcon.classList.add("diagview-search-icon");
  searchIcon.setAttribute("width", "18");
  searchIcon.setAttribute("height", "18");
  searchIcon.setAttribute("viewBox", "0 0 24 24");
  searchIcon.setAttribute("fill", "none");
  searchIcon.setAttribute("stroke", "currentColor");
  searchIcon.setAttribute("stroke-width", "2");
  setSVGContent(
    searchIcon,
    '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path>',
  );
  searchWrapper.appendChild(searchIcon);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.id = "diagview-search";
  searchInput.className = "diagview-search-input";
  searchInput.placeholder = "Search nodes...";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.setAttribute("aria-controls", "diagview-search-status");
  searchWrapper.appendChild(searchInput);

  const searchClear = document.createElement("button");
  searchClear.id = "diagview-search-clear";
  searchClear.className = "diagview-search-clear";
  searchClear.setAttribute("aria-label", "Clear search");
  searchClear.textContent = "✕";
  searchWrapper.appendChild(searchClear);

  const searchStatus = document.createElement("span");
  searchStatus.id = "diagview-search-status";
  searchStatus.className = "diagview-sr-only";
  searchStatus.setAttribute("aria-live", "polite");
  searchStatus.setAttribute("aria-atomic", "true");
  searchContainer.appendChild(searchWrapper);
  searchContainer.appendChild(searchStatus);
  topbar.appendChild(searchContainer);

  const zoomDisplay = document.createElement("span");
  zoomDisplay.id = "diagview-zoom-display";
  zoomDisplay.className = "diagview-zoom-display";
  zoomDisplay.textContent = "100%";
  topbar.appendChild(zoomDisplay);

  const shortcutHint = document.createElement("span");
  shortcutHint.className = "diagview-shortcut-hint";
  shortcutHint.appendChild(document.createTextNode("Press "));
  const kbd = document.createElement("kbd");
  kbd.textContent = "?";
  shortcutHint.appendChild(kbd);
  shortcutHint.appendChild(document.createTextNode(" for shortcuts"));
  topbar.appendChild(shortcutHint);

  const textSelectDesktopBtn = document.createElement("button");
  textSelectDesktopBtn.id = "dv-text-select-desktop-btn";
  textSelectDesktopBtn.className = "dv-text-select-btn";
  textSelectDesktopBtn.setAttribute("aria-label", "Toggle text select — copy SVG node labels");
  textSelectDesktopBtn.setAttribute("aria-pressed", "false");
  textSelectDesktopBtn.setAttribute("type", "button");
  textSelectDesktopBtn.setAttribute("data-tooltip", "Text select — copy SVG labels  (T)");
  setSVGContent(textSelectDesktopBtn, ICONS.textSelect);
  topbar.appendChild(textSelectDesktopBtn);

  const closeBtn = document.createElement("button");
  closeBtn.className = "diagview-close-btn";
  closeBtn.id = "diagview-close";
  closeBtn.title = "Close (Esc)";
  closeBtn.setAttribute("aria-label", "Close fullscreen");
  closeBtn.textContent = "✕";
  topbar.appendChild(closeBtn);

  return {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    searchClear,
    textSelectDesktopBtn,
    closeBtn,
  };
}

/**
 * Create the main modal content (viewport, minimap, laser)
 * @private
 */
function _createModalMainContent(modal, content) {
  const viewport = document.createElement("div");
  viewport.id = "diagview-modal-viewport";
  viewport.className = "diagview-modal-viewport";
  viewport.setAttribute("role", "application");
  viewport.setAttribute(
    "aria-label",
    "Diagram viewer. Use arrow keys to pan, plus and minus to zoom, Space to reset.",
  );

  // Intercept events before they reach Panzoom to allow native text selection
  const stopPropIfTextSelect = (e) => {
    if (viewport.classList.contains("dv-text-select")) {
      e.stopPropagation();
    }
  };
  viewport.addEventListener("pointerdown", stopPropIfTextSelect, true);
  viewport.addEventListener("mousedown", stopPropIfTextSelect, true);
  viewport.addEventListener("touchstart", stopPropIfTextSelect, true);
  viewport.addEventListener("pointermove", stopPropIfTextSelect, true);
  viewport.addEventListener("mousemove", stopPropIfTextSelect, true);
  viewport.addEventListener("touchmove", stopPropIfTextSelect, true);

  content.appendChild(viewport);

  // Minimap
  const minimap = document.createElement("div");
  minimap.id = "diagview-minimap";
  minimap.className = "diagview-minimap";
  const minimapView = document.createElement("div");
  minimapView.className = "dv-mm-v";
  minimap.appendChild(minimapView);
  content.appendChild(minimap);

  // Laser
  const laser = document.createElement("div");
  laser.id = "diagview-laser";
  laser.className = "diagview-laser";
  content.appendChild(laser);

  document.body.appendChild(modal);

  return { viewport, minimap };
}

/**
 * Wire up all event listeners for the modal topbar
 * @private
 */
function _wireModalEvents(elements, viewport) {
  const {
    topbar,
    searchIconBtn,
    textSelectMobileBtn,
    searchBackBtn,
    searchInput,
    searchClear,
    textSelectDesktopBtn,
    closeBtn,
  } = elements;

  function _doTextSelectToggle() {
    if (!viewport) return;
    const on = viewport.classList.toggle("dv-text-select");

    try {
      if (state.activePanzoom) {
        // BUG FIX: pause()/resume() do not exist in @panzoom/panzoom.
        // We use setOptions to disable/enable interactions instead.
        if (on) {
          state.activePanzoom.setOptions({ disablePan: true, disableZoom: true });
        } else {
          state.activePanzoom.setOptions({ disablePan: false, disableZoom: false });
        }
      }
    } catch (err) {
      console.warn("DiagView: Failed to toggle Panzoom state", err);
    }

    [textSelectMobileBtn, textSelectDesktopBtn].forEach((btn) => {
      if (btn) {
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", String(on));
      }
    });

    import("./toast.js")
      .then((m) => {
        if (m?.showToast) {
          m.showToast(on ? "📋 Text select ON — drag to copy" : "📋 Text select OFF");
        }
      })
      .catch(() => {});
  }

  // Text Selection
  const textSelectCleanup = state.events.on("dv:toggle-text-select", () => _doTextSelectToggle());
  addModalCleanupFunction(() => {
    if (typeof textSelectCleanup === "function") textSelectCleanup();
  });

  textSelectMobileBtn.addEventListener("click", _doTextSelectToggle);
  textSelectDesktopBtn.addEventListener("click", _doTextSelectToggle);

  // Search Toggle
  searchIconBtn.addEventListener("click", () => {
    const open = topbar.classList.toggle("search-open");
    invalidateFocusableCache();
    searchIconBtn.classList.toggle("active", open);
    searchIconBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      requestAnimationFrame(() => searchInput?.focus());
    }
  });

  // Search Clear & Back
  searchBackBtn.addEventListener("click", () => {
    topbar.classList.remove("search-open");
    invalidateFocusableCache();
    searchIconBtn.classList.remove("active");
    searchIconBtn.setAttribute("aria-expanded", "false");
    import("../features/lazy/search.js").then((m) => m.clearSearch()).catch(() => {});
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    import("../features/lazy/search.js").then((m) => m.clearSearch()).catch(() => {});
    searchInput.focus();
  });

  // Modal Close
  closeBtn.addEventListener("click", () => closeModal());
}
