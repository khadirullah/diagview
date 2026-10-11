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
import { safeDestroy, clearAsyncTasks, loadChunk, loadedChunk } from "./core/lifecycle.js";
import { hideToast } from "./ui/toast.js";
import {
  setupThemeWatchers,
  teardownThemeWatchers,
  syncTheme,
  syncReadable,
  clearThemeCache,
} from "./core/theme.js";
import { injectStyles, removeStyles, injectStylesInto, removeStylesFrom } from "./ui/styles.js";
import { createModal, openFullscreen } from "./ui/modal.js";
import { closeModal, syncBrandingVisibility } from "./ui/modal-controls.js";
import { syncCanvasGrid } from "./ui/canvas-grid.js";
import { resetViewportState } from "./ui/viewport.js";
import { setupKeyboardShortcuts, teardownKeyboardShortcuts } from "./features/keyboard.js";
import {
  observeDiagrams,
  stopObserving,
  refreshDiagrams,
  resetShareLinkCheck,
  processDiagrams,
  checkShareLink,
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
// Whether the running instance was started by auto-init, for a clearer warning
let autoStarted = false;

// In-flight destroy() promise. destroy() is async (it awaits modal close and
// lazy-module resets before resetting state), so a synchronous init() issued
// right after it would still see isInitialized === true and bail out, after
// which the pending destroy finishes and leaves nothing initialized. React
// StrictMode and HMR produce exactly that destroy → init sequence.
/** @type {Promise<void>|null} */
let pendingDestroy = null;

// The diagramSelector in use when destroy() last ran. destroy() resets the
// options, so an init() with no selector after it looks for the default one.
/** @type {string|null} */
let lastSelector = null;

// Counts destroy() calls. A start still waiting, for the page to load or for
// a destroy() in flight, goes ahead only if no destroy() came after it.
let destroys = 0;

/**
 * Initialize DiagView
 *
 * Runs synchronously when nothing is pending. If a destroy() is still in
 * flight, the initialization is queued behind it. Called before the page has
 * a <body>, it waits for DOMContentLoaded. Either way the returned
 * promise resolves once DiagView is initialized. A destroy() called during
 * the wait cancels the start, and the promise resolves without starting.
 * On a parsed page with no <body>, such as an SVG file, it warns and
 * resolves without starting.
 * @param {DiagViewOptions} [options] - Configuration options
 * @returns {Promise<void>} Resolves when initialization has completed
 */
function init(options = {}) {
  if (!isBrowser()) {
    console.warn("DiagView: Not running in browser environment");
    return Promise.resolve();
  }

  const seen = destroys;
  const resume = () => (seen === destroys ? init(options) : undefined);

  if (pendingDestroy) {
    return pendingDestroy.then(resume);
  }

  // A script in <head> runs before there is a body to hold the viewer or the
  // diagrams, so start once the page has been parsed. A page that is parsed
  // and still has no body, such as an SVG file, never gets one.
  if (!document.body) {
    if (document.readyState !== "loading") {
      console.warn("DiagView: The page has no <body>, so DiagView did not start");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(resume()), { once: true });
    });
  }

  // Cancel any pending auto-init if manual init is called
  if (autoInitTimeout) {
    clearTimeout(autoInitTimeout);
    autoInitTimeout = null;
  }

  if (state.isInitialized) {
    console.warn(
      autoStarted
        ? "DiagView: Already initialized by auto-init, so these options were ignored. Add data-diagview-no-auto-init to <html> or to your script tag, or call destroy() first."
        : "DiagView: Already initialized. Call destroy() first.",
    );
    return Promise.resolve();
  }

  updateConfig(options);
  clearThemeCache(); // a new config must not reuse the previous theme

  const { diagramSelector } = state.config;
  if (lastSelector && lastSelector !== diagramSelector && options?.diagramSelector == null) {
    console.warn(
      `DiagView: destroy() reset the options, so init() looks for diagrams with "${diagramSelector}", not "${lastSelector}". To keep your options, save getConfiguration() before destroy() and pass it to init().`,
    );
  }
  lastSelector = null;

  // Initialize components
  injectStyles();
  createModal();
  syncBrandingVisibility();
  setupKeyboardShortcuts();
  setupThemeWatchers();
  syncTheme(); // page buttons use the accent before the viewer first opens
  observeDiagrams();

  state.isInitialized = true;

  // Pre-warm lazy chunks to avoid cold-load flash
  import("./features/lazy/share.js").catch(() => {});
  loadChunk("search", () => import("./features/lazy/search.js")).catch(() => {});
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
  destroys++;
  clearTimeout(autoInitTimeout);
  autoInitTimeout = null;
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
  lastSelector = state.config.diagramSelector;
  // Each step runs on its own, so one that throws only logs and the rest
  // still run. The DOM we own is removed and the state is reset, so a later
  // init() is never refused with "Already initialized" after a failed step.
  const failed = (e) => console.error("DiagView: Error during teardown:", e);

  // 0. If modal is open, close it first to release scroll locks and global listeners
  if (state.isModalOpen) await closeModal().catch(failed);

  [
    // Stop observers first so no new diagrams get initialised during teardown
    stopObserving,
    teardownThemeWatchers,
    teardownKeyboardShortcuts,
    cleanupKeyboardHelp,
    resetShareLinkCheck,
    resetFocusManagement,

    // Destroy panzoom before cleanup functions run (cleanup may reference it)
    () => {
      if (state.activePanzoom) {
        safeDestroy(state.activePanzoom, "destroy");
        state.activePanzoom = null;
      }
    },

    // Run cleanup BEFORE resetConfig so cleanup functions can still read state
    runModalCleanupFunctions,
    runCleanupFunctions,
    () => clearAsyncTasks(state),

    // Lazy module resets (module-level vars not in state). A chunk that
    // never loaded has nothing to reset, so it is not loaded for this.
    () => loadedChunk("search")?.resetSearch(),
    () => loadedChunk("search")?.clearSearch(),
    () => loadedChunk("meeting mode")?.resetMeetingState(),
    hideToast,
    () => loadedChunk("minimap")?.cleanupMinimap(),

    // Restore every diagram we touched (wrapped, layout "off", error-boundary
    // and shadow-root ones alike), then drop the index the observer stamps on
    // diagrams that were only queued for lazy initialization, and the id the
    // viewer gives one of those when it is opened early.
    deinitializeAllDiagrams,
    () =>
      [document, ...state.shadowRoots].forEach((root) => {
        root.querySelectorAll("[data-diagview-index]").forEach((el) => {
          delete el.dataset.diagviewIndex;
          delete el.dataset.diagviewId;
        });
      }),
    () => state.shadowRoots.forEach((root) => removeStylesFrom(root)),

    // Remove DOM elements
    () =>
      [
        "diagview-modal",
        "diagview-toast-container",
        "diagview-toast-live",
        "diagview-temp-menu",
        "diagview-help-modal",
        "diagview-minimap",
        "diagview-laser",
      ].forEach((id) => {
        document.getElementById(id)?.remove();
      }),

    removeStyles,
    // Forget remembered zoom, pan and rotation
    clearAllZoomStates,
    // Clear event bus and caches
    () => state.events.clear(),
    clearSVGContentCache,

    // Now reset all state, after every cleanup function has run
    resetViewportState,
    resetConfig,
  ].forEach((step) => {
    try {
      step();
    } catch (e) {
      failed(e);
    }
  });
  autoStarted = false;
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
 * @param {ShadowRoot} shadowRoot - Open shadow root containing diagram elements
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
  injectStylesInto(shadowRoot);
  processDiagrams(shadowRoot);
  // A share link may point at a diagram that only exists in this shadow root
  checkShareLink();
}

/**
 * Update configuration at runtime
 * @param {DiagViewOptions} [options] - New configuration options, merged into the current ones
 */
function configure(options = {}) {
  if (!state.isInitialized) {
    console.warn("DiagView: Not initialized. Call init() first.");
    return;
  }

  updateConfig(options);
  clearThemeCache(); // colour overrides must not wait for the cache to expire
  syncReadable(syncTheme().seenBg);
  syncBrandingVisibility();
  syncCanvasGrid();
}

/**
 * Get current configuration
 * @returns {DiagViewConfig} Current configuration (read-only)
 */
function getConfiguration() {
  return getConfig();
}

// Version
/** @type {string} */
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
   * @param {HTMLElement|SVGSVGElement} element - Diagram container, or the diagram's <svg>
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

    // 1. Check if already initialized, or stopped by an early destroy()
    if (state.isInitialized || destroys) return;

    // 2. Check for explicit opt-out. It can sit on any element, not only a
    // script whose name contains "diagview". A bundled app's script is called
    // something like index-4f2a9c.js, so it goes on <html> or that script.
    const isOptedOut =
      (loaderScript && loaderScript.hasAttribute("data-diagview-no-auto-init")) ||
      !!document.querySelector("[data-diagview-no-auto-init]");

    // 3. Determine if we should initialize
    const isForced = document.querySelector("[data-diagview-auto-init]");
    const hasDiagrams = document.querySelector(DEFAULT_CONFIG.diagramSelector);

    // Forced init via attribute always wins (useful for selective init on specific pages)
    // Otherwise, auto-initialize if diagrams are found and user hasn't opted out globally
    if (isForced || (!isOptedOut && hasDiagrams)) {
      autoStarted = true;
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

// Public types
/** @typedef {import("./core/config-defaults.js").DiagViewConfig} DiagViewConfig */
/** @typedef {import("./core/config-defaults.js").DiagViewOptions} DiagViewOptions */
/** @typedef {import("./features/export.js").ExportMode} ExportMode */
/** @typedef {import("./features/export.js").ExportOptions} ExportOptions */
