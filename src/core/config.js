/**
 * DiagView Configuration Module
 * Centralized configuration and state management with validation
 * @module core/config
 */

// Import constants from new centralized file
import { TIMING, EXPORT, ZOOM, LAYOUTS, BUTTON_STYLES } from "./constants.js";

export const DEFAULT_CONFIG = {
  // Theme colors (null = auto-detect)
  accentColor: null,
  backgroundColor: null,
  textColor: null,

  // Layout settings:
  // 'header'   - Title bar at top with buttons
  // 'floating' - Buttons overlay on diagram (low center on hover)
  // 'off'      - No buttons, clicking diagram opens fullscreen directly
  layout: LAYOUTS.FLOATING,

  // Export settings
  highResScale: EXPORT.HIGH_RES_SCALE_DEFAULT,
  mobileScale: EXPORT.MOBILE_SCALE_DEFAULT,
  maxPixels: EXPORT.MAX_PIXELS_DEFAULT,

  // UI Customization (set at init() time — not deep-merged by configure())
  ui: {
    buttons: {
      style: BUTTON_STYLES.ACCENT, // options: 'transparent', 'accent', 'solid', 'neutral'
      icons: {
        // Custom SVG icon overrides (null = use built-in icons)
        copy: null,
        download: null,
        fullscreen: null,
      },
    },
  },

  // UI behavior
  showKeyboardHelp: true,
  helpTimeout: TIMING.HELP_FADE_TIMEOUT,
  diagramSelector: ".diagram, .chart, [data-diagram]",

  // Feature toggles
  rememberZoom: false, // Remember zoom/pan state per diagram (session-based)
  animateOpen: true, // Animate fullscreen open with scale effect
  printFriendly: true, // Enable print-friendly export mode
  showBranding: true, // Show "DiagView" branding link in modal

  // Toast settings
  toastDuration: TIMING.TOAST_DURATION,
  errorToastDuration: TIMING.ERROR_TOAST_DURATION,

  // CDN URL for PDF library (configurable for intranet users)
  pdfLibraryUrl: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",

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

// Internal state (mutable, use setters for safety)
const _state = {
  config: { ...DEFAULT_CONFIG },
  activePanzoom: null,
  observer: null,
  themeObserver: null,
  mediaQueryList: null,
  isInitialized: false,
  toastTimer: null,
  cleanupFunctions: [],

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

  // Rotation
  rotationAngle: 0,

  // Current diagram index (for share links)
  currentDiagramIndex: 0,
};

// State getters and setters (prevent direct mutation)
export const state = {};
Object.keys(_state).forEach((key) => {
  Object.defineProperty(state, key, {
    get: () => _state[key],
    set: (val) => {
      _state[key] = val;
    },
    enumerable: true,
  });
});

/**
 * Validate a single config value
 * @private
 */
function validateConfigValue(key, value) {
  const validators = {
    highResScale: (v) => v >= 1 && v <= 10,
    mobileScale: (v) => v >= 1 && v <= 5,
    maxZoomScale: (v) => v >= 1 && v <= ZOOM.MAX_SCALE_LIMIT,
    minZoomScale: (v) => v >= ZOOM.MIN_SCALE_LIMIT && v <= 1,
    maxPixels: (v) => v > 0,
    helpTimeout: (v) => v >= 0,
    toastDuration: (v) => v >= 0,
    errorToastDuration: (v) => v >= 0,
    zoomAnimationDuration: (v) => v >= 0,
    panAnimationDuration: (v) => v >= 0,
    diagramSelector: (v) => typeof v === "string" && v.length > 0,
    pdfLibraryUrl: (v) => typeof v === "string" && v.length > 0,
    layout: (v) => [LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(v),
    "ui.buttons.style": (v) => Object.values(BUTTON_STYLES).includes(v),
  };

  if (validators[key]) {
    return validators[key](value);
  }
  return true;
}

/**
 * Update configuration with validation
 * @param {object} options - New configuration options
 */
export function updateConfig(options = {}) {
  const newConfig = { ...state.config };

  for (const [key, value] of Object.entries(options)) {
    if (!(key in DEFAULT_CONFIG)) {
      console.warn(`DiagView: Unknown config key "${key}"`);
      continue;
    }

    if (!validateConfigValue(key, value)) {
      console.warn(`DiagView: Invalid value for "${key}": ${value}`);
      continue;
    }

    newConfig[key] = value;
  }

  state.config = newConfig;
  validateConfig();
}

/**
 * Reset configuration to defaults
 */
export function resetConfig() {
  state.config = { ...DEFAULT_CONFIG };
}

/**
 * Validate entire configuration
 * @private
 */
function validateConfig() {
  const { config } = state;

  if (config.highResScale < 1 || config.highResScale > 10) {
    console.warn("DiagView: highResScale should be between 1 and 10");
    config.highResScale = DEFAULT_CONFIG.highResScale;
  }

  if (config.mobileScale < 1 || config.mobileScale > 5) {
    console.warn("DiagView: mobileScale should be between 1 and 5");
    config.mobileScale = DEFAULT_CONFIG.mobileScale;
  }

  if (![LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(config.layout)) {
    console.warn(`DiagView: Invalid layout "${config.layout}", using default`);
    config.layout = DEFAULT_CONFIG.layout;
  }

  if (config.maxZoomScale < 1 || config.maxZoomScale > ZOOM.MAX_SCALE_LIMIT) {
    console.warn(`DiagView: maxZoomScale should be between 1 and ${ZOOM.MAX_SCALE_LIMIT}`);
    config.maxZoomScale = DEFAULT_CONFIG.maxZoomScale;
  }

  if (config.minZoomScale < ZOOM.MIN_SCALE_LIMIT || config.minZoomScale > 1) {
    console.warn(`DiagView: minZoomScale should be between ${ZOOM.MIN_SCALE_LIMIT} and 1`);
    config.minZoomScale = DEFAULT_CONFIG.minZoomScale;
  }
}

/**
 * Get current configuration (immutable copy)
 * @returns {object} Current configuration
 */
export function getConfig() {
  return { ...state.config };
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
  state.cleanupFunctions.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("DiagView: Cleanup function error:", e);
    }
  });
  state.cleanupFunctions = [];
}
