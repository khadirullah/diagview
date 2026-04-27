/**
 * DiagView Modal Component
 * OPTIMIZED with proper cleanup and no circular dependencies
 * @module ui/modal
 */

import { state, addCleanupFunction } from "../core/config.js";

import { detectTheme, syncTheme } from "../core/theme.js";
import { throttle, setSVGContent } from "../core/utils.js";
import { addModalListener } from "../core/lifecycle.js";
import { cloneSVGForModal } from "../core/svg-clone.js";
import { BRANDING } from "../core/constants.js";
import {
  initializePanzoom,
  setupViewportInteractions,
  resetTouchState,
  saveZoomState,
  restoreZoomState,
} from "../features/panzoom-integration.js";
import { setupModalFocusManagement, saveFocus, setInitialFocus } from "./focus-manager.js";
import { closeModal } from "./modal-controls.js";
import { createFloatingMenu } from "./floating-menu.js";
import {
  pushModalHistoryState,
  startVisualViewportSync,
} from "./viewport.js";

/**
 * Create modal structure
 */
export function createModal() {
  if (document.getElementById("diagview-modal")) return;

  const theme = detectTheme();
  const modal = document.createElement("div");
  modal.id = "diagview-modal";
  modal.className = "diagview-modal";
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

  // 3. Topbar
  const topbar = document.createElement("div");
  topbar.className = "diagview-topbar";
  content.appendChild(topbar);

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
  searchWrapper.appendChild(searchInput);

  const searchClear = document.createElement("button");
  searchClear.id = "diagview-search-clear";
  searchClear.className = "diagview-search-clear";
  searchClear.setAttribute("aria-label", "Clear search");
  searchClear.textContent = "✕";
  searchWrapper.appendChild(searchClear);
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

  const closeBtn = document.createElement("button");
  closeBtn.className = "diagview-close-btn";
  closeBtn.id = "diagview-close";
  closeBtn.title = "Close (Esc)";
  closeBtn.setAttribute("aria-label", "Close fullscreen");
  closeBtn.textContent = "✕";
  topbar.appendChild(closeBtn);

  // 4. Viewport
  const viewport = document.createElement("div");
  viewport.id = "diagview-modal-viewport";
  viewport.className = "diagview-modal-viewport";
  content.appendChild(viewport);

  // 5. Minimap
  const minimap = document.createElement("div");
  minimap.id = "diagview-minimap";
  minimap.className = "diagview-minimap";
  const minimapView = document.createElement("div");
  minimapView.className = "dv-mm-v";
  minimap.appendChild(minimapView);
  content.appendChild(minimap);

  // 6. Laser
  const laser = document.createElement("div");
  laser.id = "diagview-laser";
  laser.className = "diagview-laser";
  content.appendChild(laser);

  document.body.appendChild(modal);

  // Create toast
  const toast = document.createElement("div");
  toast.id = "diagview-toast";
  toast.className = "diagview-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.backgroundColor = theme.accent;
  toast.style.color = "#fff";
  document.body.appendChild(toast);

  // Setup focus management
  setupModalFocusManagement();
}

/**
 * Open fullscreen modal
 */
export function openFullscreen(element) {
  const originalSvg = element.querySelector("svg");
  if (!originalSvg) return;

  const modal = document.getElementById("diagview-modal");
  const viewport = document.getElementById("diagview-modal-viewport");

  if (!modal || !viewport) return;

  // Save focus and sync theme
  saveFocus();
  syncTheme();

  // Clone SVG with text preservation (using centralized function)
  const clone = cloneSVGForModal(originalSvg);
  viewport.replaceChildren();
  clone.style.backgroundColor = "transparent";
  viewport.appendChild(clone);

  // Open modal with animation if enabled
  modal.classList.add("open");
  if (state.config.animateOpen) {
    modal.classList.add("animate-open");
  }
  document.body.style.overflow = "hidden";
  state.isModalOpen = true;

  // Set initial focus (use rAF to ensure modal is rendered and visible)
  requestAnimationFrame(() => {
    setInitialFocus();
  });

  // Sync UI elements to visual viewport (handles pinch-zoomed browsers).
  // Must run after modal is visible (display:flex) so dimensions are valid.
  startVisualViewportSync();

  // Push history state so mobile back button closes modal
  // instead of navigating away from the page.
  pushModalHistoryState(() => closeModal());

  // Sync modal with native fullscreen exits (e.g. user presses Escape
  // while in browser fullscreen, or exits via browser UI). Without this,
  // the modal state becomes desynchronized from the viewport.
  addModalListener(document, "fullscreenchange", () => {
    if (!document.fullscreenElement && state.isModalOpen) {
      closeModal();
    }
  });

  // Show loading indicator
  const loading = document.getElementById("diagview-loading");
  if (loading) loading.classList.remove("hide");

  // Calculate and store diagram index for share links
  const allDiagrams = document.querySelectorAll(state.config.diagramSelector);
  const diagramIndex = Array.from(allDiagrams).indexOf(element);
  state.currentDiagramIndex = diagramIndex >= 0 ? diagramIndex : 0;

  // Reset touch state
  resetTouchState();

  // Initialize panzoom
  state.activePanzoom = initializePanzoom(clone);

  // Get diagram ID for zoom state
  const diagramId = element.dataset.diagviewId;

  // Apply restored view state (if opened via share link)
  // Otherwise, try to restore saved zoom state
  if (state.activePanzoom) {
    Promise.all([
      import("../features/lazy/share.js"),
      import("../features/lazy/search.js"),
    ])
      .then(([shareMod, searchMod]) => {
        const pending = shareMod.getPendingShareState(element);
        const query = pending?.query || "";

        // If we have a share link, apply it. Otherwise fallback to remembered zoom.
        if (pending) {
          shareMod.applyRestoredViewState(element, state.activePanzoom);
        } else if (diagramId) {
          restoreZoomState(diagramId, state.activePanzoom);
        }

        // Initialize search (with query if restored from link)
        searchMod.setupSearch(clone, query);
      })
      .catch(() => {
        // Fallback: at least try to setup search if one failed
        import("../features/lazy/search.js")
          .then((m) => m.setupSearch(clone))
          .catch(() => {});
      });
  }

  // Setup viewport interactions and STORE cleanup function
  if (state.activePanzoom) {
    const cleanup = setupViewportInteractions(viewport, clone, state.activePanzoom);
    addCleanupFunction(cleanup);

    // Save zoom state on changes (for remember zoom feature)
    if (diagramId && state.config.rememberZoom) {
      const saveState = () => saveZoomState(diagramId, state.activePanzoom);
      addModalListener(clone, "panzoomend", saveState);
    }
  }

  // Create floating menu
  createFloatingMenu(element, clone);


  // Setup minimap with throttled updates (lazy loaded)
  if (state.activePanzoom) {
    import("../features/lazy/minimap.js")
      .then((m) => {
        const throttledUpdate = throttle(() => {
          m.updateMinimap(clone, viewport, state.activePanzoom);
        }, 100);

        addModalListener(clone, "panzoomchange", throttledUpdate);

        // Initial update — use rAF to ensure layout is settled
        requestAnimationFrame(() => m.updateMinimap(clone, viewport, state.activePanzoom));
      })
      .catch(() => {});
  }

  // Zoom percentage display
  if (state.activePanzoom) {
    const zoomDisplay = document.getElementById("diagview-zoom-display");

    const updateZoomDisplay = (e) => {
      if (zoomDisplay) {
        const scale = e?.detail?.scale ?? state.activePanzoom.getScale();
        zoomDisplay.textContent = Math.round(scale * 100) + "%";
      }
    };

    addModalListener(clone, "panzoomchange", updateZoomDisplay);

    // Initial update
    updateZoomDisplay();
  }

  // Auto-fit on significant viewport resize (orientation change, fullscreen transitions).
  // Uses a 20% size-change threshold to avoid resetting diagram zoom when
  // mobile address bars show/hide (~5-10% height change).
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;

  const handleResize = throttle(() => {
    if (!state.activePanzoom || !state.isModalOpen) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const widthChange = Math.abs(w - lastWidth) / lastWidth;
    const heightChange = Math.abs(h - lastHeight) / lastHeight;

    if (widthChange > 0.2 || heightChange > 0.2) {
      lastWidth = w;
      lastHeight = h;
      requestAnimationFrame(() => {
        state.activePanzoom.reset({ animate: true, duration: 300 });
      });
    }
  }, 300);

  addModalListener(window, "resize", handleResize);

  // Hide loading indicator after everything is ready
  requestAnimationFrame(() => {
    const loading = document.getElementById("diagview-loading");
    if (loading) loading.classList.add("hide");
  });

  // Callback
  if (state.config.onOpen) {
    try {
      state.config.onOpen();
    } catch (e) {
      console.error("DiagView: onOpen callback error:", e);
    }
  }
}
