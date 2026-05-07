// @ts-check
/**
 * DiagView Configuration Hub
 * Centralized state management for the library.
 * @module core/config
 */

import { INITIAL_CONFIG, DEFAULT_CONFIG } from "./config-defaults.js";
import { deepMerge, deepFreeze } from "./state-utils.js";
import { validateConfig } from "./config-validation.js";
import { EventEmitter } from "./events.js";

/**
 * Initialize the global state singleton
 * @returns {DiagViewState}
 */
function createInitialState() {
  return {
    config: deepFreeze(deepMerge({}, INITIAL_CONFIG)),
    events: EventEmitter(),
    activePanzoom: null,
    observer: null,
    lazyObserver: null,
    isInitialized: false,
    isModalOpen: false,
    isModalOpening: false,
    cleanupFunctions: new Set(),
    modalCleanupFunctions: new Set(),
    hasCheckedShareLink: false,
    isInitialProcessDone: false,

    // Navigation and Zoom state
    rotationAngle: 0,
    currentDiagramIndex: -1,

    // Touch state for mobile handling
    touchState: {
      isPinching: false,
      lastTouchCount: 0,
      initialDistance: 0,
    },

    // UI state
    lastActiveElement: null,
    meetingMode: false,
    laserPointer: null,
    minimapSvg: null,
    searchMatches: [],
    searchRafId: null,
    focusManagementSetup: false,
    activeMeetingHandlers: null,
    // Theme detection state
    themeCache: null,
    themeCacheTimestamp: 0,
    themeObserver: null,
    themeChangeHandler: null,
    mediaQueryList: null,
    colorParserEl: null,
    activeSourceElement: null,
    savedScrollY: 0,

    // Registry for pending async tasks (Timeouts, RAFs)
    asyncTasks: {
      timeouts: new Set(),
      rafs: new Set(),
    },

    // Observer internal state
    nodesToProcess: new Set(),
    debouncedProcess: null,

    // Search internal state
    searchCache: new WeakMap(),

    // Meeting mode internal state
    // Storage availability (B4)
    isStorageAvailable: (() => {
      if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
      try {
        const key = "__dv_test__";
        sessionStorage.setItem(key, "1");
        sessionStorage.removeItem(key);
        return true;
      } catch (e) {
        return false;
      }
    })(),
    meetingCleanupRegistered: false,
    focusableElements: null,
  };
}

/**
 * Global State Singleton (Internal Mutable)
 * @type {DiagViewState}
 */
export const state = createInitialState();

/**
 * Public Read-Only Proxy for DiagView state.
 * SEC-4: Ensures external consumers cannot mutate library internals.
 */
export const publicState = new Proxy(state, {
  get(target, prop) {
    // @ts-ignore - Dynamic indexing for Proxy
    const value = target[prop];

    // MAJ-4: Return snapshots for mutable collections to prevent external state pollution.
    // This ensures that DiagView.state.cleanupFunctions.add() won't affect the internal state.
    if (value instanceof Set) return new Set(value);
    if (value instanceof Map) return new Map(value);
    if (Array.isArray(value)) return [...value];

    // If it's a function (like events.emit), bind it to the target
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
  set() {
    console.warn("DiagView: State is read-only. Modification ignored.");
    return true; // Silent fail in non-strict, consistent with Proxy expectations
  },
  deleteProperty() {
    console.warn("DiagView: State is read-only. Deletion ignored.");
    return true;
  },
});

/**
 * Update configuration with validation
 * @param {Record<string, *>} options - New configuration options
 */
export function updateConfig(options = {}) {
  /** @type {Record<string, *>} */
  const sanitized = {};

  // Validate and sanitize known keys
  for (const key in options) {
    if (key in DEFAULT_CONFIG) {
      sanitized[key] = options[key];
    } else {
      console.warn(`DiagView: Unknown config key "${key}" ignored.`);
    }
  }

  // Security: Prevent overriding PDF URL without integrity unless explicit
  if (sanitized["pdfLibraryUrl"]) {
    if (sanitized["pdfLibraryUrl"] === INITIAL_CONFIG.pdfLibraryUrl) {
      sanitized["pdfLibraryIntegrity"] = INITIAL_CONFIG.pdfLibraryIntegrity;
    } else if (!sanitized["pdfLibraryIntegrity"]) {
      sanitized["pdfLibraryIntegrity"] = null;
    }
  }

  // Create a new configuration by cloning current and merging new options
  const newConfig = deepMerge(deepMerge({}, state.config), sanitized);

  // Validate the new configuration BEFORE freezing
  validateConfig(newConfig);

  // Apply the new frozen configuration
  state.config = deepFreeze(newConfig);
}

/**
 * Reset configuration and state to defaults
 */
export function resetConfig() {
  // CRIT-2: Remove the color parser element from the DOM before nulling the reference
  if (state.colorParserEl && state.colorParserEl.parentNode) {
    state.colorParserEl.parentNode.removeChild(state.colorParserEl);
  }

  const freshState = createInitialState();

  // 1. Preserve and clear the EventEmitter instance
  state.events.clear();
  const eventBus = state.events;

  // 2. Reset all top-level properties from fresh state
  // This is robust: adding new properties to createInitialState()
  // will now automatically be covered by resetConfig().
  /** @type {any} */
  const target = state;
  /** @type {any} */
  const source = freshState;

  Object.keys(freshState).forEach((key) => {
    if (key === "events") return; // Handled above
    target[key] = source[key];
  });

  state.events = eventBus;

  // 3. Reset cleanup collections
  state.cleanupFunctions = new Set();
  state.modalCleanupFunctions = new Set();
  state.searchCache = new WeakMap();
}

/**
 * Get current configuration (immutable copy)
 * @returns {object} Current configuration
 */
export function getConfig() {
  return deepMerge({}, state.config);
}

/**
 * Add cleanup function to be called on destroy
 * @param {Function} fn - Cleanup function
 */
export function addCleanupFunction(fn) {
  if (typeof fn === "function") {
    state.cleanupFunctions.add(fn);
  }
}

/**
 * Run all registered cleanup functions
 */
export function runCleanupFunctions() {
  state.cleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("DiagView: Cleanup error:", e);
    }
  });
  state.cleanupFunctions.clear();
}

/**
 * Add cleanup function to be called when modal closes
 * @param {Function} fn - Cleanup function
 */
export function addModalCleanupFunction(fn) {
  if (typeof fn === "function") {
    state.modalCleanupFunctions.add(fn);
  }
}

/**
 * Run all modal-scoped cleanup functions
 */
export function runModalCleanupFunctions() {
  state.modalCleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("DiagView: Modal cleanup error:", e);
    }
  });
  state.modalCleanupFunctions.clear();
}

// Re-export constants for convenience
export { DEFAULT_CONFIG, INITIAL_CONFIG };

/**
 * @typedef {object} DiagViewState
 * @property {Record<string, *>} config - Current effective configuration
 * @property {ReturnType<typeof EventEmitter>} events - Instance-based event bus
 * @property {object|null} activePanzoom - Active Panzoom instance
 * @property {MutationObserver|null} observer - Diagram mutation observer
 * @property {IntersectionObserver|null} lazyObserver - Lazy initialization observer
 * @property {boolean} isInitialized - Whether DiagView has been initialised
 * @property {boolean} isModalOpen - Whether fullscreen modal is open
 * @property {boolean} isModalOpening - Whether modal is currently initializing
 * @property {Set<Function>} cleanupFunctions - Global cleanup functions
 * @property {Set<Function>} modalCleanupFunctions - Modal-scoped cleanup functions
 * @property {boolean} hasCheckedShareLink - Share link check flag
 * @property {boolean} isInitialProcessDone - Initial scan completed flag
 * @property {{isPinching:boolean,lastTouchCount:number,initialDistance:number}} touchState - Touch gesture state
 * @property {Element|null} lastActiveElement - Element focused before modal opened
 * @property {boolean} meetingMode - Whether laser pointer is active
 * @property {Function|null} laserPointer - Active mousemove handler for laser (internal)
 * @property {SVGElement|null} minimapSvg - Minimap SVG clone element
 * @property {Element[]} searchMatches - Current search match elements
 * @property {number|null} searchRafId - RAF id for search batching
 * @property {boolean} focusManagementSetup - Focus trap initialised flag
 * @property {object|null} activeMeetingHandlers - Active meeting mode handlers
 * @property {object|null} themeCache - Cached theme detection result
 * @property {number} themeCacheTimestamp - Timestamp of last theme detection
 * @property {MutationObserver|null} themeObserver - Observer for theme changes
 * @property {Function|null} themeChangeHandler - Handler for media query changes
 * @property {MediaQueryList|null} mediaQueryList - Media query list for theme detection
 * @property {HTMLElement|null} colorParserEl - Temporary element for color parsing
 * @property {HTMLElement|null} activeSourceElement - Original diagram element before cloning
 * @property {number} rotationAngle - Current diagram rotation (0/90/180/270)
 * @property {number} savedScrollY - Saved window scroll position for iOS lock
 * @property {number} currentDiagramIndex - Index of currently open diagram
 * @property {{timeouts: Set<*>, rafs: Set<number>}} asyncTasks - Registry for pending async tasks
 * @property {Set<Node>} nodesToProcess - Observer pending nodes queue
 * @property {Function|null} debouncedProcess - Observer debounced function
 * @property {WeakMap<SVGElement, Array<*>>} searchCache - Search candidates cache
 * @property {boolean} isStorageAvailable - Whether sessionStorage is available
 * @property {boolean} meetingCleanupRegistered - Meeting mode cleanup flag
 * @property {HTMLElement[]|null} focusableElements - Cached focusable elements for modal
 */
