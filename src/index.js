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
import {
  setupThemeWatchers,
  teardownThemeWatchers,
  syncTheme,
  clearThemeCache,
} from "./core/theme.js";
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
import { deinitializeAllDiagrams } from "./features/diagram-init.js";
import { cleanupKeyboardHelp } from "./ui/keyboard-help.js";
import { resetFocusManagement } from "./ui/focus-manager.js";
import { clearAllZoomStates } from "./features/panzoom-integration.js";

// Global auto-init handle
let autoInitTimeout = null;

// In-flight destroy() promise. destroy() is async (it awaits modal close and
// lazy-module resets before resetting state), so a synchronous init() issued
// right after it would still see isInitialized === true and bail out, after
// which the pending destroy finishes and leaves nothing initialized. React
// StrictMode and HMR produce exactly that destroy → init sequence.
/** @type {Promise<void>|null} */
let pendingDestroy = null;

/**
 * Initialize DiagView
 *
 * Runs synchronously when nothing is pending. If a destroy() is still in
 * flight, the initialization is queued behind it. Either way the returned
 * promise resolves once DiagView is initialized.
 * @param {object} options - Configuration options
 * @returns {Promise<void>} Resolves when initialization has completed
 */
function init(options = {}) {
  if (!isBrowser()) {
    console.warn("DiagView: Not running in browser environment");
    return Promise.resolve();
  }

  if (pendingDestroy) {
    return pendingDestroy.then(() => init(options));
  }

  // Cancel any pending auto-init if manual init is called
  if (autoInitTimeout) {
    clearTimeout(autoInitTimeout);
    autoInitTimeout = null;
  }

  if (state.isInitialized) {
    console.warn("DiagView: Already initialized. Call destroy() first.");
    return Promise.resolve();
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
  return Promise.resolve();
}

/**
 * Destroy and clean up DiagView
 *
 * Idempotent while in flight: a second call during teardown returns the same
 * promise instead of starting a concurrent teardown.
 * @returns {Promise<void>} Resolves when teardown has completed
 */
function destroy() {
  if (pendingDestroy) return pendingDestroy;

  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized");
    return Promise.resolve();
  }

  pendingDestroy = _teardown().finally(() => {
    pendingDestroy = null;
  });
  return pendingDestroy;
}

/**
 * Full teardown sequence. Only ever invoked through destroy().
 * @private
 */
async function _teardown() {
  // Everything below runs inside try/finally: whatever a single step does,
  // the DOM we own is removed and the state is reset, so a later init() is
  // never refused with "Already initialized" because of a failed destroy().
  try {
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
        import("./features/lazy/search.js").then((m) => {
          m.resetSearch?.();
          m.clearSearch();
        }),
        import("./features/lazy/meeting-mode.js").then((m) => m.resetMeetingState?.()),
        import("./ui/toast.js").then((m) => m.hideToast()),
        import("./features/lazy/minimap.js").then((m) => m.cleanupMinimap()),
      ]);
    } catch (e) {
      console.error("DiagView: Error during async cleanup:", e);
    }

    // Restore every diagram we touched (wrapped, layout "off", error-boundary
    // and shadow-root ones alike), then drop the index the observer stamps on
    // diagrams that were only queued for lazy initialization.
    deinitializeAllDiagrams();
    [document, ...state.shadowRoots].forEach((root) => {
      root.querySelectorAll("[data-diagview-index]").forEach((el) => {
        delete el.dataset.diagviewIndex;
      });
    });
  } catch (e) {
    console.error("DiagView: Error during teardown:", e);
  } finally {
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

  state.shadowRoots.add(shadowRoot);
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
  clearThemeCache(); // colour overrides must not wait for the cache to expire
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
/** Utility functions for SVG processing and security (also a named export). */
const utils = {
  sanitizeSVG,
};

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
  utils,

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
  window.DiagView = window.DiagView || DiagView;

  // The tag that loaded us, captured now: document.currentScript is only set
  // while a classic script is executing, so it is null inside the timer below.
  const loaderScript = document.currentScript;

  const autoInit = () => {
    autoInitTimeout = null;

    // 1. Check if already initialized
    if (state.isInitialized) return;

    // 2. Check for explicit opt-out. Look at ANY diagview script tag, not just
    // the first one — a "diagview-setup.js" placed before the library tag must
    // not hide the opt-out on the library tag itself.
    const isOptedOut =
      (loaderScript && loaderScript.hasAttribute("data-diagview-no-auto-init")) ||
      !!document.querySelector('script[src*="diagview"][data-diagview-no-auto-init]');

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

  // Never auto-init synchronously. Module and defer scripts execute at
  // readyState "interactive", so a synchronous auto-init would run during
  // module evaluation and the user's own DiagView.init({...}) one line later
  // would hit "Already initialized". Deferring by one task lets a manual
  // init() cancel the pending auto-init (see init()).
  const scheduleAutoInit = () => {
    if (autoInitTimeout) clearTimeout(autoInitTimeout);
    autoInitTimeout = setTimeout(autoInit, 0);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleAutoInit, { once: true });
  } else {
    scheduleAutoInit();
  }
}

// Export for module systems
export default DiagView;
export {
  publicState as state,
  utils,
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
