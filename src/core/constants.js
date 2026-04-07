/**
 * DiagView Constants
 * Centralized constants for the entire library
 * @module core/constants
 */

/**
 * Timing constants (milliseconds)
 */
export const TIMING = {
  // UI Feedback
  BUTTON_SUCCESS_DURATION: 1000,
  TOAST_DURATION: 2500,
  ERROR_TOAST_DURATION: 5000,
  HELP_FADE_TIMEOUT: 8000, // Auto-close keyboard help (0 to disable)

  // Animations
  ZOOM_ANIMATION_DURATION: 200,
  PAN_ANIMATION_DURATION: 200,

  // Debouncing/Throttling
  THEME_SYNC_DEBOUNCE: 50,
  SEARCH_THROTTLE: 150,
  OBSERVER_DEBOUNCE: 100,
};

/**
 * Export settings
 */
export const EXPORT = {
  SVG_EXPORT_PADDING: 40,
  HIGH_RES_SCALE_DEFAULT: 6,
  MOBILE_SCALE_DEFAULT: 2,
  PDF_SCALE: 2,
  MAX_PIXELS_DEFAULT: 25000000,
};

/**
 * Zoom limits
 */
export const ZOOM = {
  MAX_SCALE_DEFAULT: 25,
  MIN_SCALE_DEFAULT: 0.05,
  MAX_SCALE_LIMIT: 50,
  MIN_SCALE_LIMIT: 0.01,
};

/**
 * Keyboard pan steps (pixels)
 */
export const PAN = {
  STEP_NORMAL: 40,
  STEP_FAST: 120,
};

/**
 * Default colors
 */
export const COLORS = {
  // Light mode
  ACCENT_LIGHT: "#3b82f6",
  BG_LIGHT: "#ffffff",
  TEXT_LIGHT: "#1e293b",

  // Dark mode
  ACCENT_DARK: "#60a5fa",
  BG_DARK: "#0f172a",
  TEXT_DARK: "#f1f5f9",
};

/**
 * CSS Selectors
 */
export const SELECTORS = {
  DIAGRAM: ".diagram, .chart, [data-diagram]",
  SEARCH_NODES: ".node, .cluster, .edgePath, .label, text",
};

/**
 * Layout modes
 */
export const LAYOUTS = {
  HEADER: "header",
  FLOATING: "floating",
  OFF: "off",
};

/**
 * Button styles
 */
export const BUTTON_STYLES = {
  TRANSPARENT: "transparent",
  ACCENT: "accent",
  SOLID: "solid",
  NEUTRAL: "neutral",
};
