/**
 * DiagView - Universal Interactive Diagram Viewer
 * @version 1.0.0
 * @license MIT
 *
 * A lightweight, framework-agnostic library for displaying interactive
 * diagrams with zoom, pan, search, and export capabilities.
 */

import { state, updateConfig, resetConfig, getConfig } from "./core/config.js";
import { isBrowser } from "./core/utils.js";
import { safeDestroy } from "./core/lifecycle.js";
import {
  setupThemeWatchers,
  teardownThemeWatchers,
  syncTheme,
} from "./core/theme.js";
import { injectStyles, removeStyles } from "./ui/styles.js";
import { createModal, closeModal } from "./ui/modal.js";
import {
  setupKeyboardShortcuts,
  teardownKeyboardShortcuts,
} from "./features/keyboard.js";
import {
  observeDiagrams,
  stopObserving,
  refreshDiagrams,
} from "./core/observer.js";
import { exportDiagram } from "./features/export.js";
import { deinitializeDiagram } from "./features/diagram-init.js";

// Global initialization guard
let globalInitGuard = false;

/**
 * Initialize DiagView
 * @param {Object} options - Configuration options
 */
function init(options = {}) {
  if (!isBrowser()) {
    console.warn("DiagView: Not running in browser environment");
    return;
  }

  if (globalInitGuard || state.isInitialized) {
    console.warn("DiagView: Already initialized. Call destroy() first.");
    return;
  }

  globalInitGuard = true;
  updateConfig(options);

  // Initialize components
  injectStyles();
  createModal();
  setupKeyboardShortcuts();
  setupThemeWatchers();
  observeDiagrams();

  // Attach close handler
  const closeBtn = document.getElementById("diagview-close");
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }

  state.isInitialized = true;
  // Note: Share link check is done in observer.js processDiagrams()
}

/**
 * Destroy and clean up DiagView
 */
function destroy() {
  if (!state.isInitialized && !globalInitGuard) {
    console.warn("DiagView: Not initialized");
    return;
  }

  // Stop observers
  stopObserving();
  teardownThemeWatchers();
  teardownKeyboardShortcuts();

  // Destroy panzoom using safe destroy utility
  if (state.activePanzoom) {
    safeDestroy(state.activePanzoom, "destroy");
    state.activePanzoom = null;
  }

  // Remove DOM elements
  [
    "diagview-modal",
    "diagview-toast",
    "diagview-temp-menu",
    "diagview-help",
    "diagview-minimap",
    "diagview-laser",
  ].forEach((id) => {
    document.getElementById(id)?.remove();
  });

  // Clean up diagram wrappers
  document.querySelectorAll(".diagview-wrapper").forEach((wrapper) => {
    const diagram = wrapper.querySelector(state.config.diagramSelector);
    if (diagram) {
      deinitializeDiagram(diagram);
    }
  });

  // Remove styles
  removeStyles();

  // Reset state
  state.isInitialized = false;
  globalInitGuard = false;
  resetConfig();
  state.touchState = {
    isPinching: false,
    lastTouchCount: 0,
    initialDistance: 0,
  };
  state.meetingMode = false;
  state.rotationAngle = 0;
  state.searchIndex = -1;
}

/**
 * Refresh and initialize new diagrams
 */
function refresh() {
  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized. Call init() first.");
    return;
  }

  syncTheme();
  refreshDiagrams();
}

/**
 * Update configuration at runtime
 * @param {Object} options - New configuration options
 */
function configure(options = {}) {
  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized. Call init() first.");
    return;
  }

  updateConfig(options);
  syncTheme();
}

/**
 * Get current configuration
 * @returns {Object} Current configuration
 */
function getConfiguration() {
  return getConfig();
}

// Public API
const DiagView = {
  // Core methods
  init,
  destroy,
  refresh,
  configure,
  getConfiguration,

  // Export functionality
  exportDiagram,

  // Utilities
  closeModal,

  // Version
  version: "1.0.0",
};

// Auto-bootstrap (optional)
if (typeof window !== "undefined") {
  window.DiagView = DiagView;

  // Auto-initialize on DOMContentLoaded
  const autoInit = () => {
    if (globalInitGuard) return;

    // Check for auto-init attribute
    const autoInitEl = document.querySelector("[data-diagview-auto-init]");
    if (
      autoInitEl ||
      document.querySelector(".diagram, .chart, [data-diagram]")
    ) {
      setTimeout(() => {
        DiagView.init();
      }, 100);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
}

// Export for module systems
export default DiagView;
export {
  init,
  destroy,
  refresh,
  configure,
  getConfiguration,
  exportDiagram,
  closeModal,
};
