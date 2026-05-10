import { TIMING, ZOOM, LAYOUTS, BUTTON_STYLES, SELECTORS, EXPORT } from "./constants.js";
import { deepMerge, deepFreeze } from "./state-utils.js";

/**
 * Initial configuration template.
 * Private to prevent accidental mutation.
 */
export const INITIAL_CONFIG = {
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

  // Security & Sanitization
  sanitize: "auto", // "auto" | "strict" | "off"
  allowedImageTypes: ["png", "jpeg", "webp", "gif"],
  security: {
    // 'strict' (Default) - Blocks foreignObject, animate, style injection, etc.
    // 'permissive' - Only blocks scripts, iframes, objects (v0.x behavior)
    // 'off' - Skips sanitization (for trusted diagrams only)
    mode: "strict",
    // Allow data-diagview-sanitize attribute to override this mode per-diagram
    allowOverrides: true,
    // Allow external resources (e.g. Google Fonts, remote CSS) in strict/permissive mode
    allowRemoteResources: false,
  },

  // Performance & Safeguards
  performance: {
    largeFileThreshold: EXPORT.LARGE_FILE_THRESHOLD,
    criticalFileLimit: EXPORT.CRITICAL_FILE_LIMIT_DEFAULT,
  },

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

  // Watermark settings (Applied only during export/download)
  watermark: {
    enabled: false,
    text: "",
    style: "corner", // "corner" | "background" | "both"
    position: "bottom-right", // "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "four-sides"
    opacity: 0.2,
  },
};

/**
 * Default configuration object (frozen)
 */
export const DEFAULT_CONFIG = deepFreeze(deepMerge({}, INITIAL_CONFIG));
