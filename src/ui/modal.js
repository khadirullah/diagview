/**
 * DiagView Modal Component
 * OPTIMIZED with proper cleanup and no circular dependencies
 * @module ui/modal
 */

import { state, addCleanupFunction } from "../core/config.js";
import { CONSTANTS } from "../core/constants.js";
import { detectTheme, syncTheme } from "../core/theme.js";
import { throttle } from "../core/utils.js";
import { addManagedListener } from "../core/lifecycle.js";
import { cloneSVGForModal } from "../core/svg-clone.js";
import {
  initializePanzoom,
  setupViewportInteractions,
  resetTouchState,
  saveZoomState,
  restoreZoomState,
} from "../features/panzoom-integration.js";
import { setupModalFocusManagement, saveFocus } from "./focus-manager.js";
import { closeModal } from "./modal-controls.js";
import { createFloatingMenu } from "./floating-menu.js";

/**
 * Create modal structure
 */
export function createModal() {
  if (document.getElementById("diagview-modal")) return;

  const theme = detectTheme();
  const modal = document.createElement("div");
  modal.id = "diagview-modal";
  modal.className = "diagview-modal";

  modal.style.backgroundColor = theme.bg;
  modal.style.setProperty("--dv-current-bg", theme.bg);
  modal.style.setProperty("--dv-current-text", theme.text);
  modal.style.setProperty("--dv-current-accent", theme.accent);

  modal.innerHTML = `
    <div class="diagview-loading" id="diagview-loading">
      <div class="diagview-spinner"></div>
    </div>
    <div class="diagview-modal-content">
      <div class="diagview-topbar">
        <div class="diagview-search-container">
          <div class="diagview-search-wrapper">
            <svg class="diagview-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              id="diagview-search"
              class="diagview-search-input"
              placeholder="Search nodes..."
              autocomplete="off"
              spellcheck="false"
            />
            <button id="diagview-search-clear" class="diagview-search-clear" aria-label="Clear search">✕</button>
          </div>
          <span class="diagview-src-cnt"></span>
        </div>
        <span id="diagview-zoom-display" class="diagview-zoom-display">100%</span>
        <span class="diagview-shortcut-hint">Press <kbd>?</kbd> for shortcuts</span>
        <button class="diagview-close-btn" id="diagview-close" title="Close (Esc)" aria-label="Close fullscreen">✕</button>
      </div>
      <div id="diagview-modal-viewport" class="diagview-modal-viewport"></div>
      <div id="diagview-minimap" class="diagview-minimap">
        <div class="dv-mm-v"></div>
      </div>
      <div id="diagview-laser" class="diagview-laser"></div>
    </div>
  `;

  document.body.appendChild(modal);

  // Create toast
  const toast = document.createElement("div");
  toast.id = "diagview-toast";
  toast.className = "diagview-toast";
  toast.style.backgroundColor = theme.accent;
  toast.style.color = "#fff";
  document.body.appendChild(toast);

  // Setup focus management
  setupModalFocusManagement();
}

/**
 * Apply restored view state from share link
 * @private
 */
function applyShareLinkState(element, panzoom) {
  import("../features/lazy/share.js")
    .then((m) => {
      const applied = m.applyRestoredViewState(element, panzoom);
      return applied;
    })
    .catch(() => false);
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
  viewport.innerHTML = "";
  clone.style.backgroundColor = "transparent";
  viewport.appendChild(clone);

  // Open modal with animation if enabled
  modal.classList.add("open");
  if (state.config.animateOpen) {
    modal.classList.add("animate-open");
  }
  document.body.style.overflow = "hidden";
  state.isModalOpen = true;

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
    applyShareLinkState(element, state.activePanzoom);

    // If no share state, try to restore saved zoom
    if (diagramId) {
      restoreZoomState(diagramId, state.activePanzoom);
    }
  }

  // Setup viewport interactions and STORE cleanup function
  if (state.activePanzoom) {
    const cleanup = setupViewportInteractions(
      viewport,
      clone,
      state.activePanzoom,
    );
    addCleanupFunction(cleanup);

    // Save zoom state on changes (for remember zoom feature)
    if (diagramId && state.config.rememberZoom) {
      const saveState = () => saveZoomState(diagramId, state.activePanzoom);
      addManagedListener(clone, "panzoomend", saveState);
    }
  }

  // Setup search (lazy loaded)
  import("../features/lazy/search.js")
    .then((m) => m.setupSearch(clone))
    .catch(() => { });

  // Create floating menu
  createFloatingMenu(element, clone);

  // Setup minimap with throttled updates (lazy loaded)
  if (state.activePanzoom) {
    import("../features/lazy/minimap.js")
      .then((m) => {
        const throttledUpdate = throttle(() => {
          m.updateMinimap(clone, viewport, state.activePanzoom);
        }, 100);

        addManagedListener(clone, "panzoomchange", throttledUpdate);

        // Initial update
        setTimeout(() => m.updateMinimap(clone, viewport, state.activePanzoom), 100);
      })
      .catch(() => { });
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

    addManagedListener(clone, "panzoomchange", updateZoomDisplay);

    // Initial update
    updateZoomDisplay();
  }

  // Auto-fit on orientation change (mobile)
  const handleOrientationChange = () => {
    if (state.activePanzoom && state.isModalOpen) {
      // Small delay to let the viewport resize
      setTimeout(() => {
        state.activePanzoom.reset({ animate: true, duration: 300 });
      }, 150);
    }
  };

  addManagedListener(window, "orientationchange", handleOrientationChange);

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

// Re-export closeModal from modal-controls
export { closeModal };
