/* global __DV_VERSION__ */
/**
 * DiagView - Universal Interactive Diagram Viewer
 * @version __DV_VERSION__
 * @license MIT
 *
 * A lightweight, framework-agnostic library for displaying interactive
 * diagrams with zoom, pan, search, and export capabilities.
 */

import {
  state,
  publicState,
  updateConfig,
  resetConfig,
  getConfig,
  DEFAULT_CONFIG,
  runCleanupFunctions,
  runModalCleanupFunctions,
} from "./core/config.js";
import { isBrowser, sanitizeSVG, clearSVGContentCache } from "./core/utils.js";
import { safeDestroy, clearAsyncTasks } from "./core/lifecycle.js";
import { setupThemeWatchers, teardownThemeWatchers, syncTheme } from "./core/theme.js";
import { injectStyles, removeStyles } from "./ui/styles.js";
import { createModal, openFullscreen } from "./ui/modal.js";
import { closeModal, syncBrandingVisibility } from "./ui/modal-controls.js";
import { resetViewportState } from "./ui/viewport.js";
import { setupKeyboardShortcuts, teardownKeyboardShortcuts } from "./features/keyboard.js";
import {
  observeDiagrams,
  stopObserving,
  refreshDiagrams,
  resetShareLinkCheck,
  processDiagrams,
} from "./core/observer.js";
import {
  exportDiagram,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  exportToWebP,
  exportToPDF,
  copyToClipboard,
} from "./features/export.js";
import { deinitializeDiagram } from "./features/diagram-init.js";
import { cleanupKeyboardHelp } from "./ui/keyboard-help.js";
import { resetFocusManagement } from "./ui/focus-manager.js";
import { clearAllZoomStates } from "./features/panzoom-integration.js";

// Global auto-init handle
let autoInitTimeout = null;

/**
 * Initialize DiagView
 * @param {object} options - Configuration options
 */
function init(options = {}) {
  if (!isBrowser()) {
    console.warn("DiagView: Not running in browser environment");
    return;
  }

  // Cancel any pending auto-init if manual init is called
  if (autoInitTimeout) {
    clearTimeout(autoInitTimeout);
    autoInitTimeout = null;
  }

  if (state.isInitialized) {
    console.warn("DiagView: Already initialized. Call destroy() first.");
    return;
  }

  updateConfig(options);

  // Initialize components
  injectStyles();
  createModal();
  syncBrandingVisibility();
  setupKeyboardShortcuts();
  setupThemeWatchers();
  observeDiagrams();

  // Attach close handler
  const closeBtn = document.getElementById("diagview-close");
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }

  state.isInitialized = true;

  // Pre-warm lazy chunks to avoid cold-load flash
  import("./features/lazy/share.js").catch(() => {});
  import("./features/lazy/search.js").catch(() => {});
  // Note: Share link check is done in observer.js processDiagrams()
}

/**
 * Destroy and clean up DiagView
 */
async function destroy() {
  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized");
    return;
  }

  // 0. If modal is open, close it first to release scroll locks and global listeners
  if (state.isModalOpen) {
    await closeModal();
  }

  // Stop observers first so no new diagrams get initialised during teardown
  stopObserving();
  teardownThemeWatchers();
  teardownKeyboardShortcuts();
  cleanupKeyboardHelp();
  resetShareLinkCheck();
  resetFocusManagement();

  // Destroy panzoom before cleanup functions run (cleanup may reference it)
  if (state.activePanzoom) {
    safeDestroy(state.activePanzoom, "destroy");
    state.activePanzoom = null;
  }

  // Run cleanup BEFORE resetConfig so cleanup functions can still read state
  runModalCleanupFunctions();
  runCleanupFunctions();
  clearAsyncTasks(state);

  // Lazy module resets (module-level vars not in state)
  // We use Promise.all to ensure all async cleanups finish before resetConfig()
  try {
    await Promise.all([
      import("./features/lazy/search.js").then((m) => m.resetSearch?.()),
      import("./features/lazy/meeting-mode.js").then((m) => m.resetMeetingState?.()),
      import("./ui/toast.js").then((m) => m.hideToast()),
      import("./features/lazy/minimap.js").then((m) => m.cleanupMinimap()),
      import("./features/lazy/search.js").then((m) => m.clearSearch()),
    ]);
  } catch (e) {
    console.error("DiagView: Error during async cleanup:", e);
  }

  // Clean up diagram wrappers
  document.querySelectorAll(".diagview-wrapper").forEach((wrapper) => {
    const diagram = wrapper.querySelector(state.config.diagramSelector);
    if (diagram) deinitializeDiagram(diagram);
  });

  // Remove DOM elements
  [
    "diagview-modal",
    "diagview-toast",
    "diagview-temp-menu",
    "diagview-help-modal",
    "diagview-minimap",
    "diagview-laser",
  ].forEach((id) => {
    document.getElementById(id)?.remove();
  });

  // Remove styles
  removeStyles();

  // Clean up all saved zoom states from sessionStorage
  clearAllZoomStates();

  // Clear event bus and caches
  state.events.clear();
  clearSVGContentCache();

  // Now reset all state — cleanup functions have already run
  resetViewportState();
  resetConfig();
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
 * Initialize diagrams inside a Shadow DOM root.
 * @param {ShadowRoot} shadowRoot
 */
function initShadowRoot(shadowRoot) {
  if (!state.isInitialized) {
    console.warn("DiagView: Call init() before initShadowRoot()");
    return;
  }

  if (!shadowRoot || !shadowRoot.querySelectorAll) {
    console.warn("DiagView: Invalid ShadowRoot provided to initShadowRoot()");
    return;
  }

  processDiagrams(shadowRoot);
}

/**
 * Update configuration at runtime
 * @param {object} options - New configuration options
 */
function configure(options = {}) {
  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized. Call init() first.");
    return;
  }

  updateConfig(options);
  syncTheme();
  syncBrandingVisibility();
}

/**
 * Get current configuration
 * @returns {object} Current configuration
 */
function getConfiguration() {
  return getConfig();
}

// Version
const version = __DV_VERSION__;

// Public API
const DiagView = {
  // Core methods
  init,
  initShadowRoot,
  destroy,
  refresh,
  configure,
  getConfiguration,

  // State (for debugging/inspection)
  /** Internal state object for debugging and inspection (Read-Only) */
  state: publicState,

  // Export functionality
  exportDiagram,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  exportToWebP,
  exportToPDF,
  copyToClipboard,

  // Utilities
  closeModal,
  /** Utility functions for SVG processing and security */
  utils: {
    sanitizeSVG,
  },

  /**
   * Open a diagram in fullscreen programmatically.
   * @param {HTMLElement} element - Diagram container
   * @param {{zoom?: number, searchQuery?: string}} [options]
   */
  openFullscreen,

  // Version
  version,
};

// Auto-bootstrap (optional)
if (typeof window !== "undefined") {
  // Defensive global assignment to prevent overwriting existing versions
  if (typeof window !== "undefined") {
    window.DiagView = window.DiagView || DiagView;
  }

  // Auto-initialize on DOMContentLoaded
  const autoInit = () => {
    // 1. Check if already initialized
    if (state.isInitialized) return;

    // 2. Check for explicit opt-out on the script tag itself
    const currentScript =
      document.currentScript || document.querySelector('script[src*="diagview"]');
    const isOptedOut = currentScript && currentScript.hasAttribute("data-diagview-no-auto-init");

    // 3. Determine if we should initialize
    const isForced = document.querySelector("[data-diagview-auto-init]");
    const hasDiagrams = document.querySelector(DEFAULT_CONFIG.diagramSelector);

    // Forced init via attribute always wins (useful for selective init on specific pages)
    if (isForced) {
      DiagView.init();
      return;
    }

    // Otherwise, auto-initialize if diagrams are found and user hasn't opted out globally
    if (!isOptedOut && hasDiagrams) {
      DiagView.init();
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
  initShadowRoot,
  destroy,
  refresh,
  configure,
  getConfiguration,
  exportDiagram,
  exportToPNG,
  exportToSVG,
  exportToJPEG,
  exportToWebP,
  exportToPDF,
  copyToClipboard,
  closeModal,
  openFullscreen,
  version,
};
