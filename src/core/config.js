/**
 * DiagView Configuration Module
 * Centralized configuration and state management with validation
 * @module core/config
 */

// Import constants from new centralized file
import { TIMING, EXPORT, ZOOM, LAYOUTS, BUTTON_STYLES, SELECTORS } from "./constants.js";

/**
 * Initial configuration template.
 * Private to prevent accidental mutation.
 */
const INITIAL_CONFIG = {
  // Theme colors (null = auto-detect)
  accentColor: null,
  backgroundColor: null,
  textColor: null,

  // Layout settings
  layout: LAYOUTS.FLOATING,

  // Export settings
  highResScale: EXPORT.HIGH_RES_SCALE_DEFAULT,
  mobileScale: EXPORT.MOBILE_SCALE_DEFAULT,
  maxPixels: EXPORT.MAX_PIXELS_DEFAULT,

  // UI Customization
  ui: {
    buttons: {
      style: BUTTON_STYLES.ACCENT,
      icons: {
        copy: null,
        download: null,
        fullscreen: null,
      },
    },
  },

  // UI behavior
  showKeyboardHelp: true,
  helpTimeout: TIMING.HELP_FADE_TIMEOUT,
  diagramSelector: SELECTORS.DIAGRAM,

  // Interaction options
  naturalPanning: false,

  // Feature toggles
  showMinimap: true,
  rememberZoom: false,
  animateOpen: true,
  printFriendly: true,
  showBranding: true,
  immersiveMode: false,

  /** Duration (ms) for notifications */
  toastDuration: TIMING.TOAST_DURATION,
  errorToastDuration: TIMING.ERROR_TOAST_DURATION,

  // CDN URL for PDF library
  // WARNING: If you change this URL, you must also update pdfLibraryIntegrity
  // or set it to null, otherwise the browser will block the script (SRI).
  pdfLibraryUrl: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  pdfLibraryIntegrity:
    "sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==",

  // Zoom/Pan settings
  maxZoomScale: ZOOM.MAX_SCALE_DEFAULT,
  minZoomScale: ZOOM.MIN_SCALE_DEFAULT,
  zoomAnimationDuration: TIMING.ZOOM_ANIMATION_DURATION,
  panAnimationDuration: TIMING.PAN_ANIMATION_DURATION,

  // Callbacks
  onExport: null,
  onError: null,
  onZoomChange: null,
  onOpen: null,
  onClose: null,
};

/**
 * Public reference for key-checking and defaults.
 * Frozen to prevent mutation.
 */
export const DEFAULT_CONFIG = Object.freeze(JSON.parse(JSON.stringify(INITIAL_CONFIG)));

/**
 * Creates a fresh, deep-cloned copy of the initial state.
 * This is the heart of the Factory Pattern.
 * @returns {DiagViewState}
 */
function createInitialState() {
  return {
    config: deepMerge({}, INITIAL_CONFIG),
    activePanzoom: null,
    observer: null,
    themeObserver: null,
    mediaQueryList: null,
    isInitialized: false,
    toastTimer: null,
    cleanupFunctions: [],
    modalCleanupFunctions: [],
    hasCheckedShareLink: false,
    isInitialProcessDone: false,

    // Touch state for mobile handling
    touchState: {
      isPinching: false,
      lastTouchCount: 0,
      initialDistance: 0,
    },

    // Focus management
    lastActiveElement: null,
    isModalOpen: false,

    // Meeting mode
    meetingMode: false,
    laserPointer: null,

    // Minimap
    minimapSvg: null,

    // Search
    searchMatches: [],
    searchIndex: -1,
    searchRafId: null,

    // UI Lifecycle State
    focusManagementSetup: false,
    activeMeetingHandlers: null,

    // Theme State
    themeCache: null,
    themeCacheTimestamp: 0,
    colorParserEl: null,
    themeChangeHandler: null,
    themeObserver: null,
    mediaQueryList: null,

    // Rotation
    rotationAngle: 0,

    // Current diagram index (for share links)
    currentDiagramIndex: 0,
  };
}

/**
 * @typedef {Object} DiagViewState
 * @property {object} config - Current effective configuration
 * @property {object|null} activePanzoom - Active Panzoom instance
 * @property {boolean} isInitialized - Whether DiagView has been initialised
 * @property {boolean} isModalOpen - Whether fullscreen modal is open
 * @property {number} rotationAngle - Current diagram rotation (0/90/180/270)
 * @property {boolean} meetingMode - Whether laser pointer is active
 * @property {number} currentDiagramIndex - Index of currently open diagram
 * @property {Array} searchMatches - Current search match elements
 * @property {number} searchIndex - Index of highlighted search match
 */

/** @type {DiagViewState} */
const _state = createInitialState();

/**
 * Internal state singleton.
 * We use Object.seal to prevent external scripts from adding or deleting properties,
 * ensuring the integrity of the library's internal brain.
 *
 * NOTE: This is a mutable singleton for internal use. Direct mutation is deprecated
 * and will be replaced by private class fields (#state) in Phase 2.
 *
 * @type {DiagViewState}
 */
export const state = _state;
Object.seal(state);

/**
 * Deep merge two objects
 * @private
 */
function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object") {
      if (Array.isArray(source[key])) {
        // Fix for Bug #12: Clone arrays to prevent shared references
        target[key] = [...source[key]];
      } else {
        if (!target[key] || typeof target[key] !== "object") target[key] = {};
        deepMerge(target[key], source[key]);
      }
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Update configuration with validation
 * @param {object} options - New configuration options
 */
export function updateConfig(options = {}) {
  const sanitized = {};

  // Validate and sanitize known keys
  for (const key in options) {
    if (key in DEFAULT_CONFIG) {
      sanitized[key] = options[key];
    } else {
      console.warn(`DiagView: Unknown config key "${key}" ignored.`);
    }
  }

  // Ensure PDF integrity hash is synchronized with the URL (Bug #25)
  if (sanitized.pdfLibraryUrl) {
    if (sanitized.pdfLibraryUrl === DEFAULT_CONFIG.pdfLibraryUrl) {
      // If switching back to default URL, also restore default integrity
      sanitized.pdfLibraryIntegrity = DEFAULT_CONFIG.pdfLibraryIntegrity;
    } else if (!sanitized.pdfLibraryIntegrity) {
      // If switching to custom URL without providing a hash, clear the old default
      sanitized.pdfLibraryIntegrity = null;
    }
  }

  // Perform deep merge into current config
  deepMerge(state.config, sanitized);

  validateConfig();
}

/**
 * Reset configuration and state to defaults
 */
export function resetConfig() {
  const freshState = createInitialState();

  // Clear current state and replace with fresh values
  // We use Object.assign to keep the 'state' reference the same for other modules
  Object.assign(_state, freshState);
}

/**
 * Validate entire configuration
 * @private
 */
function validateConfig() {
  const { config } = state;

  const checkRange = (key, min, max) => {
    if (config[key] < min || config[key] > max) {
      console.warn(`DiagView: ${key} should be between ${min} and ${max}`);
      config[key] = DEFAULT_CONFIG[key];
    }
  };

  checkRange("highResScale", 1, 10);
  checkRange("mobileScale", 1, 5);
  checkRange("maxZoomScale", 1, ZOOM.MAX_SCALE_LIMIT);
  checkRange("minZoomScale", ZOOM.MIN_SCALE_LIMIT, 1);
  checkRange("maxPixels", 1000000, 100000000);

  if (![LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(config.layout)) {
    console.warn(`DiagView: Invalid layout "${config.layout}", using default`);
    config.layout = DEFAULT_CONFIG.layout;
  }

  // Ensure positive values for timings
  [
    "helpTimeout",
    "toastDuration",
    "errorToastDuration",
    "zoomAnimationDuration",
    "panAnimationDuration",
  ].forEach((key) => {
    if (config[key] < 0) {
      console.warn(`DiagView: ${key} must be positive`);
      config[key] = DEFAULT_CONFIG[key];
    }
  });
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
    state.cleanupFunctions.push(fn);
  }
}

/**
 * Run all cleanup functions and clear
 */
export function runCleanupFunctions() {
  while (state.cleanupFunctions.length > 0) {
    const fn = state.cleanupFunctions.pop();
    try {
      fn();
    } catch (e) {
      console.error("DiagView: Cleanup function error:", e);
    }
  }
}

/**
 * Run only modal-specific cleanup functions and clear
 */
export function runModalCleanupFunctions() {
  while (state.modalCleanupFunctions.length > 0) {
    const fn = state.modalCleanupFunctions.pop();
    try {
      fn();
    } catch (e) {
      console.error("DiagView: Modal cleanup function error:", e);
    }
  }
}
