/**
 * DiagView Theme Detection and Synchronization
 * OPTIMIZED with robust contrast checking and multiple fallbacks
 * @module core/theme
 */

import { state } from "./config.js";
import { TIMING, COLORS } from "./constants.js";
import { debounce, removeEmptyAttr } from "./utils.js";

import { addManagedListener } from "./lifecycle.js";

// Theme State handled via state in config.js
const CACHE_DURATION = 1000; // 1 second
const NAMED_COLOR_CACHE = new Map();

/**
 * Calculate relative luminance (WCAG 2.0)
 * @private
 */
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((val) => {
    val /= 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Singleton element for parsing named colors via CSS (Handled via state.colorParserEl)

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const RGB_FN_RE = /^rgba?\(/;

/**
 * Read the first three channels out of an "rgb(r, g, b)" / "rgba(...)" string.
 * @private
 * @returns {number[]|null} [r, g, b] or null when the string is not rgb()/rgba()
 */
function parseRgbString(value) {
  if (!value || !RGB_FN_RE.test(value) || value.includes("%")) return null;
  const match = value.match(/\d+(?:\.\d+)?/g);
  return match && match.length >= 3 ? match.slice(0, 3).map((n) => Math.round(Number(n))) : null;
}

/**
 * Ask the engine whether a string is a colour at all. CSS.supports() is the
 * authority where it exists; otherwise a detached element's style is used,
 * which drops values it cannot parse.
 * @private
 */
function isSupportedColor(value) {
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", value);
  }
  if (typeof document === "undefined") return false;
  const probe = document.createElement("span");
  probe.style.color = value;
  return probe.style.color !== "";
}

/**
 * Resolve a colour to sRGB by painting it on a 1x1 canvas. This is the only
 * conversion engines agree on for oklch()/lab()/lch()/color(), which
 * getComputedStyle returns verbatim.
 * @private
 */
function parseColorViaCanvas(value) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2]];
  } catch (_e) {
    return null;
  }
}

/**
 * Resolve any CSS colour the browser accepts to RGB.
 * @private
 */
function parseColorViaBrowser(value) {
  if (typeof document === "undefined") return null;
  if (!isSupportedColor(value)) return null;

  if (!state.colorParserEl) {
    // Use <meta> instead of <div> and append to <html> to avoid body layout flushes
    state.colorParserEl = document.createElement("meta");
    state.colorParserEl.setAttribute("aria-hidden", "true");
    state.colorParserEl.style.cssText =
      "display:none!important;position:absolute!important;visibility:hidden!important;";
    document.documentElement.appendChild(state.colorParserEl);
  }

  // Legacy sRGB syntaxes (names, hsl(), hwb(), ...) compute to rgb()/rgba()
  state.colorParserEl.style.color = "";
  state.colorParserEl.style.color = value;
  const computed =
    typeof getComputedStyle === "function" ? getComputedStyle(state.colorParserEl).color : "";
  const rgb = parseRgbString(computed);
  if (rgb) return rgb;

  // Modern colour spaces stay in their own notation; let the canvas convert
  return parseColorViaCanvas(value);
}

/**
 * Parse color string to RGB array
 * @param {string} color - Any CSS colour string
 * @returns {number[]|null} [r, g, b] or null when the string is not a colour
 */
export function parseColor(color) {
  if (!color || typeof color !== "string") return null;

  const trimmed = color.trim().toLowerCase();

  // 1. Hex color (Fast path). Anything else starting with "#" is not a colour.
  if (trimmed.startsWith("#")) {
    if (!HEX_RE.test(trimmed)) return null;
    const hex = trimmed.slice(1);
    if (hex.length <= 4) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  // 2. RGB/RGBA color (Fast path)
  const fast = parseRgbString(trimmed);
  if (fast) return fast;

  // 3. Everything else goes through the engine. Cache hits only, so a
  // rejected value is re-checked (and re-warned) every time.
  // OPT-7: Use a targeted cache for named colors to prevent layout thrashing
  if (NAMED_COLOR_CACHE.has(trimmed)) {
    return NAMED_COLOR_CACHE.get(trimmed);
  }

  const result = parseColorViaBrowser(trimmed);
  if (result) {
    NAMED_COLOR_CACHE.set(trimmed, result);
  }
  return result;
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.0)
 * @param {string} color1 - First CSS colour
 * @param {string} color2 - Second CSS colour
 * @returns {number} Ratio from 1 to 21, or 1 when either colour does not parse
 */
export function getContrastRatio(color1, color2) {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);

  if (!rgb1 || !rgb2) return 1;

  const lum1 = getLuminance(...rgb1);
  const lum2 = getLuminance(...rgb2);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Colour for text and icons drawn on the accent. White while it reaches
 * 3:1, the minimum for icons and controls, so the usual blue and red keep
 * their white icons. Below that, near-black if it reads better.
 * @param {string} accent - Accent colour
 * @returns {string} "#fff" or the dark canvas colour
 */
export function onAccentColor(accent) {
  const dark = COLORS.BG_DARK;
  const white = getContrastRatio("#fff", accent);
  return white < 3 && getContrastRatio(dark, accent) > white ? dark : "#fff";
}

/**
 * Background and text for a notice drawn on a colour. Notice text needs
 * 4.5:1, more than the 3:1 onAccentColor() allows for icons. White if it
 * reaches that, then near-black. If neither does, white on the colour
 * darkened just enough to reach it.
 * @param {string} color - Notice colour
 * @returns {{bg: string, text: string}} Colours to draw the notice with
 */
export function noticeColors(color) {
  const rgb = parseColor(color);
  if (!rgb || getContrastRatio("#fff", color) >= 4.5) return { bg: color, text: "#fff" };
  if (getContrastRatio(COLORS.BG_DARK, color) >= 4.5) return { bg: color, text: COLORS.BG_DARK };
  return { bg: darkenForWhite(rgb), text: "#fff" };
}

/**
 * A colour mixed toward black just far enough for white text on it to
 * reach 4.5:1, a step at a time. Black itself always passes.
 * @private
 * @param {number[]} rgb - Colour to darken
 * @returns {string} Hex colour
 */
function darkenForWhite(rgb) {
  const hex = (c) => c.toString(16).padStart(2, "0");
  let bg = "";
  for (let step = 1; step <= 100; step++) {
    const k = 1 - step / 100;
    bg = "#" + rgb.map((c) => hex(Math.round(c * k))).join("");
    if (getContrastRatio("#fff", bg) >= 4.5) break;
  }
  return bg;
}

/**
 * Fill for menu buttons and items that carry a label on the accent. Text
 * needs 4.5:1, more than the 3:1 onAccentColor() allows for icons. Where
 * the text on the accent is white and falls short, the fill is the accent
 * darkened just enough, so the usual blue keeps its white labels.
 * @private
 * @param {string} accent - Accent colour
 * @returns {string} The accent, or the accent darkened
 */
function accentFill(accent) {
  const rgb = parseColor(accent);
  return rgb && onAccentColor(accent) === "#fff" && getContrastRatio("#fff", accent) < 4.5
    ? darkenForWhite(rgb)
    : accent;
}

/**
 * Detect if system/document is in dark mode
 * @private
 */
function isDarkMode() {
  // Check class-based dark mode (Tailwind, etc.)
  if (
    document.documentElement.classList.contains("dark") ||
    document.body.classList.contains("dark")
  ) {
    return true;
  }

  // Check data-theme attribute (multiple variants)
  const htmlTheme = document.documentElement.getAttribute("data-theme");
  const bodyTheme = document.body.getAttribute("data-theme");
  const bsTheme = document.documentElement.getAttribute("data-bs-theme"); // Bootstrap

  if (htmlTheme === "dark" || bodyTheme === "dark" || bsTheme === "dark") {
    return true;
  }

  // Check CSS media query
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return true;
  }

  return false;
}

/**
 * Get CSS variable with fallbacks
 * @private
 */
function getCSSVariable(varName, fallbackLight, fallbackDark, isDark) {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);

  const value = root.getPropertyValue(varName) || body.getPropertyValue(varName);

  // Use fallback
  if (!value || !value.trim()) {
    return isDark ? fallbackDark : fallbackLight;
  }

  return value.trim();
}

/**
 * Detect background color with multiple fallback strategies
 * @private
 * @returns {string|null} The page's own background, or null when it has none
 */
function detectBackground() {
  const body = getComputedStyle(document.body);
  const html = getComputedStyle(document.documentElement);

  // Try body background
  let bg = body.backgroundColor;

  // Try html background
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
    bg = html.backgroundColor;
  }

  // Try CSS variables
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
    bg =
      getCSSVariable("--background") || getCSSVariable("--bg-color") || getCSSVariable("--body-bg");
  }

  return !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)" ? null : bg;
}

/**
 * Whether a string is a CSS colour. Bare HSL triplets such as
 * "222.2 47.4% 11.2%" (Tailwind/shadcn) are not.
 * @private
 */
function isColor(value) {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function"
    ? CSS.supports("color", value)
    : parseColor(value) !== null;
}

/**
 * Read a page CSS variable, returning it only if it is a colour.
 * @private
 * @returns {string|null} The colour string, or null when unset/invalid
 */
function cssVarColor(varName) {
  const value = getCSSVariable(varName, "", "", false);
  return value && isColor(value) ? value : null;
}

// Last invalid value warned about per config key. Theme detection runs many
// times per page, so each bad value warns once.
const warnedColors = {};
// Colour pairs already warned about for low contrast
const warnedContrast = new Set();
// Whether <html> had a style attribute before syncTheme() first wrote to it
let htmlHadStyle = null;

/** Whether <html> had a style attribute before DiagView first wrote to it */
export function rootHadStyle() {
  return htmlHadStyle !== false;
}

/**
 * Read a colour override from config, returning it only if it parses.
 * @param {"backgroundColor"|"textColor"|"accentColor"|"warningColor"} key - Config key to read
 * @param {Function} [check] - Colour test, parseColor by default
 * @returns {string|null} The colour string, or null when unset/invalid
 */
function validConfigColor(key, check = parseColor) {
  const value = state.config?.[key];
  if (!value || typeof value !== "string") return null;
  if (check(value)) return value;
  if (warnedColors[key] !== value) {
    warnedColors[key] = value;
    console.warn(`DiagView: ${key} "${value}" is not a valid colour, ignoring.`);
  }
  return null;
}

/**
 * Read the alpha channel of a colour string.
 * @private
 * @returns {number} Alpha from 0 to 1, and 1 when the colour has none
 */
function colorAlpha(value) {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return 0;
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 4) return parseInt(hex[3] + hex[3], 16) / 255;
    if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
    return 1;
  }
  if (!v.endsWith(")")) return 1;
  // Alpha is after the slash in space syntax, or the fourth comma argument
  const args = v.slice(v.indexOf("(") + 1, -1);
  const alpha = args.includes("/") ? args.split("/").pop() : args.split(",")[3];
  const n = parseFloat(alpha ?? "");
  if (Number.isNaN(n)) return 1;
  return Math.min(Math.max(alpha.trim().endsWith("%") ? n / 100 : n, 0), 1);
}

/**
 * The colour a see-through canvas shows, which is the canvas colour laid
 * over the page. An opaque colour comes back unchanged.
 * @private
 * @param {string} color - Canvas colour
 * @param {string} page - Page colour behind the viewer, which must parse
 * @returns {string} The colour text is actually drawn on
 */
function overPage(color, page) {
  const a = colorAlpha(color);
  if (a >= 1) return color;
  const fg = parseColor(color) || [0, 0, 0];
  const under = /** @type {number[]} */ (parseColor(page));
  return `rgb(${[0, 1, 2].map((i) => Math.round(fg[i] * a + under[i] * (1 - a))).join(", ")})`;
}

/**
 * Enhanced theme detection with caching and robust fallbacks
 * @returns {object} Theme object with isDark, bg, text, accent, and seenBg,
 *   the opaque colour a see-through canvas shows over the page
 */
export function detectTheme() {
  if (typeof window === "undefined") {
    return {
      isDark: false,
      bg: COLORS.BG_LIGHT,
      seenBg: COLORS.BG_LIGHT,
      text: COLORS.TEXT_LIGHT,
      accent: COLORS.ACCENT_LIGHT,
    };
  }

  // Return cached theme if fresh
  const now = Date.now();
  if (state.themeCache && now - state.themeCacheTimestamp < CACHE_DURATION) {
    return state.themeCache;
  }

  let isDark = isDarkMode();
  let bg = detectBackground();
  // A page with no background shows the browser's own, which stays white
  // unless the page opts into a dark color-scheme. The OS alone does not
  // darken it.
  const painted =
    bg ||
    (isDark && /dark/.test(getComputedStyle(document.documentElement).colorScheme)
      ? COLORS.BG_DARK
      : COLORS.BG_LIGHT);
  bg ||= isDark ? COLORS.BG_DARK : COLORS.BG_LIGHT;
  const page = parseColor(bg) ? bg : isDark ? COLORS.BG_DARK : COLORS.BG_LIGHT;

  // Explicit config override (backgroundColor: null = auto-detect).
  // A parseable colour replaces detection and re-derives isDark from its
  // luminance; an unparseable value is ignored with a warning. A colour
  // with alpha lets the page show through, so its luminance is taken
  // from the mix of the two, and "transparent" follows the page alone.
  const cfgBg = validConfigColor("backgroundColor");
  if (cfgBg) {
    bg = cfgBg;
    isDark = getLuminance(...parseColor(overPage(cfgBg, page))) < 0.5;
  }

  // Apply explicit Canvas Theme Mode overrides if set by user
  if (state.activeCanvasThemeMode === "light") {
    isDark = false;
    bg = COLORS.BG_LIGHT;
  } else if (state.activeCanvasThemeMode === "dark") {
    isDark = true;
    bg = COLORS.BG_DARK;
  } else if (state.activeCanvasThemeMode === "custom" && state.customCanvasColor) {
    bg = state.customCanvasColor;
    const parsed = parseColor(bg);
    if (parsed) {
      const lum = getLuminance(...parsed);
      isDark = lum < 0.5;
    }
  }

  // The colour text is drawn on, the page mixed in under a see-through canvas
  const canvas = overPage(bg, page);

  // Detect text color with multiple fallbacks.
  // Explicit config override (textColor: null = auto-detect) wins over
  // detection but still goes through the WCAG contrast guard below.
  let text = validConfigColor("textColor") || getCSSVariable("--diagram-text", null, null, isDark);

  // Fallback to other common variable names
  if (text === "inherit") text = getCSSVariable("--text-color", null, null, isDark);

  // With no colour from config or the page, the text is ours. Take
  // whichever of the two reads better on the canvas, as a mid-tone canvas
  // can count as dark and still need the dark text.
  const own = !text;
  if (own) {
    const onLight = getContrastRatio(canvas, COLORS.TEXT_LIGHT);
    const onDark = getContrastRatio(canvas, COLORS.TEXT_DARK);
    text =
      onLight > onDark || (onLight === onDark && !isDark) ? COLORS.TEXT_LIGHT : COLORS.TEXT_DARK;
  }

  // Ensure sufficient contrast (WCAG AA: 4.5:1)
  const contrast = getContrastRatio(canvas, text);
  if (contrast < 4.5) {
    const pair = canvas + "|" + text;
    if (!warnedContrast.has(pair)) {
      warnedContrast.add(pair);
      console.warn(
        `DiagView: Low contrast detected (${contrast.toFixed(2)}:1), using high-contrast fallback`,
      );
    }
    // Fall back to black or white, whichever reads better
    text =
      getContrastRatio(canvas, "#000") > getContrastRatio(canvas, "#fff") ? "#000000" : "#ffffff";
  }

  // Accent: config override, then --diagram-accent if it holds a real colour.
  // --primary is not read. Many sites set it near black or white, which
  // makes the accent buttons and notices hard to tell from the page.
  // The built-in blue must stand out on the page, where the diagram buttons
  // sit, and on the canvas. A dark OS alone does not make a white page dark.
  const shown = parseColor(painted) ? painted : page;
  const worst = (c) => Math.min(getContrastRatio(shown, c), getContrastRatio(canvas, c));
  const accent =
    validConfigColor("accentColor", isColor) ||
    cssVarColor("--diagram-accent") ||
    (worst(COLORS.ACCENT_DARK) > worst(COLORS.ACCENT_LIGHT)
      ? COLORS.ACCENT_DARK
      : COLORS.ACCENT_LIGHT);

  const warning = validConfigColor("warningColor", isColor) || COLORS.WARNING;

  const theme = {
    isDark,
    bg,
    seenBg: canvas,
    text,
    accent,
    onAccent: onAccentColor(accent),
    warning,
  };

  // Cache theme
  state.themeCache = theme;
  state.themeCacheTimestamp = now;

  return theme;
}

/**
 * Change the active canvas theme mode and color
 * @param {'auto'|'light'|'dark'|'custom'} mode Active canvas theme mode
 * @param {string|null} [customColor] Custom hex color string
 */
export function setCanvasTheme(mode, customColor = null) {
  state.activeCanvasThemeMode = mode;
  state.customCanvasColor = customColor;
  clearThemeCache();

  const theme = syncTheme();
  syncReadable(theme.seenBg);
  return theme;
}

/**
 * Readable text is measured against the canvas, so recolour for a new one.
 * @param {string} bg - Canvas colour as seen, the page colour under a
 *   see-through canvas
 */
export function syncReadable(bg) {
  if (state.readableText) {
    import("../features/lazy/readable-text.js").then((m) => m.syncReadableText(bg)).catch(() => {});
  }
}

/**
 * The text colour faded toward the canvas, as far as 30%, while it still
 * reaches 4.5:1. For secondary text such as the menu headings and the
 * search placeholder. The search box lays a faint grey wash over the
 * canvas, so the colour must pass on that too. On a canvas where the text
 * only just passes it stays at full strength.
 * @param {string} text - Text colour
 * @param {string} bg - Opaque canvas colour
 * @returns {string} The muted colour
 */
function mutedText(text, bg) {
  const t = parseColor(text);
  const b = parseColor(bg);
  if (!t || !b) return text;
  const rgb = (c) => `rgb(${c.map(Math.round).join(", ")})`;
  const box = rgb(b.map((c) => c + (128 - c) * 0.12));
  for (let step = 6; step > 0; step--) {
    const mix = rgb(t.map((c, i) => c + (b[i] - c) * step * 0.05));
    if (getContrastRatio(mix, bg) >= 4.5 && getContrastRatio(mix, box) >= 4.5) return mix;
  }
  return text;
}

/**
 * Apply theme to CSS variables
 */
export function syncTheme() {
  const theme = detectTheme();
  const root = document.documentElement;
  if (htmlHadStyle === null) htmlHadStyle = root.hasAttribute("style");

  // Update CSS variables
  root.style.setProperty("--dv-bg", theme.bg);
  // Panels over the diagram need a solid colour so their text keeps its
  // contrast when the canvas lets the page show through
  root.style.setProperty("--dv-panel-bg", theme.seenBg);
  root.style.setProperty("--dv-text-color", theme.text);
  root.style.setProperty("--dv-muted-text", mutedText(theme.text, theme.seenBg));
  root.style.setProperty("--dv-accent", theme.accent);
  root.style.setProperty("--dv-on-accent", theme.onAccent);
  root.style.setProperty("--dv-accent-fill", accentFill(theme.accent));

  // The search outline follows the canvas, never the diagram's own colours.
  // Pick whichever ring colour stands out more against the canvas.
  const { SEARCH_RING_LIGHT: ringLight, SEARCH_RING_DARK: ringDark } = COLORS;
  const darkCanvas =
    parseColor(theme.bg) && colorAlpha(theme.bg) >= 1
      ? getContrastRatio(ringDark, theme.bg) > getContrastRatio(ringLight, theme.bg)
      : theme.isDark;
  root.style.setProperty("--dv-search-ring", darkCanvas ? ringDark : ringLight);

  // The menu toggle track is a faint white wash that only shows on dark
  // canvases. Light canvases get a solid grey so the switch stays visible.
  if (darkCanvas) root.style.removeProperty("--dv-toggle-track");
  else root.style.setProperty("--dv-toggle-track", COLORS.TOGGLE_TRACK_LIGHT);

  // Update modal if exists
  const modal = document.getElementById("diagview-modal");
  if (modal) {
    modal.style.backgroundColor = theme.bg;
    modal.style.color = theme.text;
    // The minimap image baked in the old text colour for currentColor parts
    if (state.minimapSvg) {
      import("../features/lazy/minimap.js").then((m) => m.refreshMinimapColour()).catch(() => {});
    }
  }

  return theme;
}

/**
 * Clear theme cache (useful when theme changes)
 */
export function clearThemeCache() {
  state.themeCache = null;
  state.themeCacheTimestamp = 0;
}

/**
 * Setup theme watchers with debouncing
 */

// The pending theme sync, so teardown can cancel it
let debouncedSync = null;

export function setupThemeWatchers() {
  if (state.themeObserver) return;

  let lastBg = null;
  debouncedSync = debounce(() => {
    clearThemeCache();
    const { seenBg: bg } = syncTheme();
    // In Auto mode, or with a see-through canvas, the colour seen follows
    // the page, so readable text follows too
    if (bg !== lastBg) syncReadable(bg);
    lastBg = bg;
  }, TIMING.THEME_SYNC_DEBOUNCE);

  // Watch DOM changes
  state.themeObserver = new MutationObserver(debouncedSync);

  state.themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-bs-theme", "style"],
  });

  state.themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "style"],
  });

  // Watch system theme preference
  const mql = window.matchMedia("(prefers-color-scheme: dark)");

  state.themeChangeHandler = () => {
    clearThemeCache();
    debouncedSync();
  };

  if (mql.addEventListener) {
    addManagedListener(mql, "change", state.themeChangeHandler);
  } else {
    mql.addListener(state.themeChangeHandler);
  }

  state.mediaQueryList = mql;
}

/**
 * Cleanup theme watchers
 */
export function teardownThemeWatchers() {
  // A sync still waiting would write the variables back after we remove them
  debouncedSync?.cancel();
  debouncedSync = null;

  if (state.themeObserver) {
    state.themeObserver.disconnect();
    state.themeObserver = null;
  }

  if (state.mediaQueryList && state.themeChangeHandler) {
    const mql = state.mediaQueryList;

    if (mql.removeEventListener) {
      mql.removeEventListener("change", state.themeChangeHandler);
    } else {
      mql.removeListener(state.themeChangeHandler);
    }
    state.mediaQueryList = null;
    state.themeChangeHandler = null;
  }

  // BUG FIX: Remove the color parser element to prevent DOM leaking in SPAs
  if (state.colorParserEl) {
    state.colorParserEl.remove();
    state.colorParserEl = null;
  }

  // Remove the CSS variables syncTheme() put on <html>
  const root = document.documentElement;
  root.style.removeProperty("--dv-bg");
  root.style.removeProperty("--dv-panel-bg");
  root.style.removeProperty("--dv-text-color");
  root.style.removeProperty("--dv-muted-text");
  root.style.removeProperty("--dv-accent");
  root.style.removeProperty("--dv-on-accent");
  root.style.removeProperty("--dv-accent-fill");
  root.style.removeProperty("--dv-search-ring");
  root.style.removeProperty("--dv-toggle-track");
  removeEmptyAttr(root, "style", htmlHadStyle !== false);
  htmlHadStyle = null;

  clearThemeCache();
}
