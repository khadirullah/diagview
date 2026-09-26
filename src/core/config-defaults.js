import { TIMING, ZOOM, LAYOUTS, BUTTON_STYLES, SELECTORS, EXPORT } from "./constants.js";
import { deepMerge, deepFreeze } from "./state-utils.js";

/**
 * Button icons. Each value is SVG markup, or null for the built-in icon.
 * @typedef {object} DiagViewButtonIcons
 * @property {string|null} copy - Copy button icon
 * @property {string|null} download - Download button icon
 * @property {string|null} fullscreen - Fullscreen button icon
 */

/**
 * @typedef {object} DiagViewButtonsConfig
 * @property {"transparent"|"accent"|"solid"|"neutral"} style - Button look
 * @property {DiagViewButtonIcons} icons - Icon overrides
 */

/**
 * @typedef {object} DiagViewUIConfig
 * @property {DiagViewButtonsConfig} buttons - Diagram toolbar buttons
 */

/**
 * @typedef {object} DiagViewSecurityConfig
 * @property {"strict"|"permissive"|"off"} mode - SVG sanitization level
 * @property {boolean} allowOverrides - Let data-diagview-sanitize change the mode per diagram
 * @property {boolean} allowRemoteResources - Keep external fonts and stylesheets
 */

/**
 * @typedef {object} DiagViewPerformanceConfig
 * @property {number} largeFileThreshold - Has no effect, kept for old configs
 * @property {number} criticalFileLimit - Largest SVG, in characters of markup, DiagView will clone
 */

/**
 * @typedef {"corner"|"background"|"both"} WatermarkStyle
 */

/**
 * @typedef {"top-left"|"top-right"|"bottom-left"|"bottom-right"|"center"|"four-sides"} WatermarkPosition
 */

/**
 * Export matches watermark values without regard to case. This accepts each
 * part between hyphens in lower, upper or capitalised case, so "Corner",
 * "TOP-LEFT" and "Top-Left" all type check.
 * @template {string} S
 * @typedef {S extends `${infer A}-${infer B}`
 *   ? `${A|Uppercase<A>|Capitalize<A>}-${AnyCase<B>}`
 *   : S|Uppercase<S>|Capitalize<S>} AnyCase
 */

/**
 * Watermark drawn on exported images only.
 * @typedef {object} DiagViewWatermarkConfig
 * @property {boolean} enabled - Draw the watermark
 * @property {string} text - Watermark text
 * @property {AnyCase<WatermarkStyle>} style - Corner text, a large centred mark, or both
 * @property {AnyCase<WatermarkPosition>} position - Where corner text goes
 * @property {number} opacity - From 0 to 1
 */

/**
 * Full configuration, as returned by getConfiguration().
 * @typedef {object} DiagViewConfig
 * @property {string|null} accentColor - Accent colour, null to detect from the page
 * @property {string|null} backgroundColor - Background colour, null to detect from the page
 * @property {string|null} textColor - Text colour, null to detect from the page
 * @property {"header"|"floating"|"off"} layout - Where the diagram buttons go
 * @property {number} highResScale - Export scale on desktop, 1 to 10
 * @property {number} mobileScale - Export scale on mobile, 1 to 5
 * @property {number} maxPixels - Largest export canvas in pixels
 * @property {DiagViewUIConfig} ui - Button look and icons
 * @property {boolean} showKeyboardHelp - Allow the ? shortcuts panel
 * @property {number} helpTimeout - Milliseconds before the shortcuts panel closes, 0 keeps it open
 * @property {string} diagramSelector - CSS selector for diagram containers
 * @property {boolean} naturalPanning - Arrow keys move the diagram in the arrow's direction
 * @property {boolean} showMinimap - Show the minimap in the viewer
 * @property {boolean} rememberZoom - Keep each diagram's zoom and pan in session storage
 * @property {boolean} animateOpen - Animate the viewer opening
 * @property {boolean} showBranding - Show the DiagView link in the viewer
 * @property {boolean} showFirstTimeThemeHint - Point to the canvas theme menu the first time the viewer opens
 * @property {string[]} allowedImageTypes - Image types allowed in data URLs
 * @property {DiagViewSecurityConfig} security - Sanitization settings
 * @property {DiagViewPerformanceConfig} performance - Size limits
 * @property {number} toastDuration - Milliseconds a notification stays
 * @property {number} errorToastDuration - Milliseconds an error notification stays
 * @property {string} pdfLibraryUrl - Script URL for jsPDF
 * @property {string|null} pdfLibraryIntegrity - SRI hash for pdfLibraryUrl, null to skip the check
 * @property {number} maxZoomScale - Largest zoom, 1 to 50
 * @property {number} minZoomScale - Smallest zoom, 0.01 to 1
 * @property {number} zoomAnimationDuration - Zoom animation in milliseconds
 * @property {number} panAnimationDuration - Pan animation in milliseconds
 * @property {((mode: string, filename: string) => void)|null} onExport - Called after a successful export with the format and the file name without extension
 * @property {((error: Error) => void)|null} onError - Called when a diagram fails to render
 * @property {((scale: number) => void)|null} onZoomChange - Called with the new zoom scale
 * @property {(() => void)|null} onOpen - Called after the viewer opens
 * @property {(() => void)|null} onClose - Called after the viewer closes
 * @property {DiagViewWatermarkConfig} watermark - Export watermark
 */

/**
 * Options for init() and configure(). Every key is optional, including the
 * keys inside each group. Omitted keys keep their current value. Unknown
 * keys are allowed, as at runtime, where DiagView warns and ignores them.
 * @typedef {Partial<Omit<DiagViewConfig, "ui"|"security"|"performance"|"watermark">> & {
 *   ui?: { buttons?: Partial<Omit<DiagViewButtonsConfig, "icons">> & { icons?: Partial<DiagViewButtonIcons> } },
 *   security?: Partial<DiagViewSecurityConfig> & { [key: string]: unknown },
 *   performance?: Partial<DiagViewPerformanceConfig> & { [key: string]: unknown },
 *   watermark?: Partial<DiagViewWatermarkConfig> & { [key: string]: unknown },
 * } & { [key: string]: unknown }} DiagViewOptions
 */

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
  showBranding: true,
  showFirstTimeThemeHint: true,

  // Security & Sanitization
  allowedImageTypes: ["png", "jpeg", "webp", "gif"],
  security: {
    // 'strict' (Default) - Blocks animation, feImage, remote foreignObject, style injection, etc.
    // 'permissive' - Blocks scripts, iframes, objects, applets, embeds, forms,
    //                link/base/meta, on* attributes, dangerous URLs and SMIL
    //                that writes href or on*
    // 'off' - Skips sanitization (for trusted diagrams only)
    mode: "strict",
    // Allow data-diagview-sanitize attribute to override this mode per-diagram
    allowOverrides: true,
    // Allow external resources (e.g. Google Fonts, remote CSS) in strict/permissive mode
    allowRemoteResources: false,
  },

  // Performance & Safeguards
  performance: {
    // No effect. Only cloneSVG's preserveStyles copy read it, and no caller
    // turns that on. Export copies styles its own way, with a node cap.
    // Kept so existing configs and getConfiguration() output stay the same.
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
