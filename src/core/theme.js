/**
 * DiagView Theme Detection and Synchronization
 * OPTIMIZED with robust contrast checking and multiple fallbacks
 * @module core/theme
 */

import { state } from "./config.js";
import { TIMING, COLORS } from "./constants.js";
import { debounce, removeEmptyAttr } from "./utils.js";

import { addManagedListener, loadChunk } from "./lifecycle.js";
import {
  getLuminance,
  isColor,
  parseColor,
  getContrastRatio,
  onAccentColor,
  accentFill,
  colorAlpha,
  overPage,
  mutedText,
} from "./color.js";

export { parseColor, getContrastRatio, onAccentColor, noticeColors } from "./color.js";

// Theme State handled via state in config.js
const CACHE_DURATION = 1000; // 1 second

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

  // Try CSS variables that hold a colour. shadcn's --background is a bare
  // triplet such as "0 0% 100%".
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
    bg = cssVarColor("--background") || cssVarColor("--bg-color") || cssVarColor("--body-bg");
  }

  return !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)" ? null : bg;
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
 * Text colour for a background. The page's or config's colour if it
 * reaches 4.5:1, otherwise black or white. With no colour given, whichever
 * of ours reads better, as a mid-tone background can count as dark and
 * still need the dark text.
 * @private
 * @param {string} bg - Opaque background colour
 * @param {string|null} chosen - Colour from config or the page
 * @param {boolean} isDark - Whether the theme counts as dark
 * @param {boolean} [warn] - Log a console warning when the colour fails
 * @returns {string} The text colour
 */
function textOn(bg, chosen, isDark, warn) {
  let text = chosen;
  if (!text) {
    const onLight = getContrastRatio(bg, COLORS.TEXT_LIGHT);
    const onDark = getContrastRatio(bg, COLORS.TEXT_DARK);
    text =
      onLight > onDark || (onLight === onDark && !isDark) ? COLORS.TEXT_LIGHT : COLORS.TEXT_DARK;
  }

  // Ensure sufficient contrast (WCAG AA: 4.5:1)
  const contrast = getContrastRatio(bg, text);
  if (contrast < 4.5) {
    const pair = bg + "|" + text;
    if (warn && !warnedContrast.has(pair)) {
      warnedContrast.add(pair);
      console.warn(
        `DiagView: Low contrast detected (${contrast.toFixed(2)}:1), using high-contrast fallback`,
      );
    }
    // Fall back to black or white, whichever reads better
    text = getContrastRatio(bg, "#000") > getContrastRatio(bg, "#fff") ? "#000000" : "#ffffff";
  }
  return text;
}

/**
 * Enhanced theme detection with caching and robust fallbacks
 * @returns {object} Theme object with isDark, bg, text, accent, seenBg,
 *   the opaque colour a see-through canvas shows over the page, and
 *   pageBg and pageText, the colours the page shows and reads in
 */
export function detectTheme() {
  if (typeof window === "undefined") {
    return {
      isDark: false,
      bg: COLORS.BG_LIGHT,
      seenBg: COLORS.BG_LIGHT,
      text: COLORS.TEXT_LIGHT,
      pageBg: COLORS.BG_LIGHT,
      pageText: COLORS.TEXT_LIGHT,
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
  // unless the page opts into a dark color-scheme, in CSS or with a <meta>
  // tag. The OS alone does not darken it.
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const painted =
    bg ||
    (isDark &&
    /dark/.test(
      scheme && scheme !== "normal"
        ? scheme
        : document.querySelector('meta[name="color-scheme"]')?.getAttribute("content"),
    )
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
  let chosen =
    validConfigColor("textColor") || getCSSVariable("--diagram-text", null, null, isDark);

  // Fallback to other common variable names
  if (chosen === "inherit") chosen = getCSSVariable("--text-color", null, null, isDark);

  const text = textOn(canvas, chosen, isDark, true);

  // The page toolbar and error box sit on the page, not the canvas, so
  // their text is measured against what the page shows.
  const shown = parseColor(painted) ? painted : page;
  const pageText = textOn(shown, chosen, isDark);

  // Accent: config override, then --diagram-accent if it holds a real colour.
  // --primary is not read. Many sites set it near black or white, which
  // makes the accent buttons and notices hard to tell from the page.
  // The built-in blue must stand out on the page, where the diagram buttons
  // sit, and on the canvas. A dark OS alone does not make a white page dark.
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
    pageBg: shown,
    pageText,
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
    loadChunk("readable text", () => import("../features/lazy/readable-text.js"))
      .then((m) => m.syncReadableText(bg))
      .catch(() => {});
  }
}

const BUILT_IN_ACCENTS = [COLORS.ACCENT_LIGHT, COLORS.ACCENT_DARK];

/**
 * Set an edge colour for the accent when it falls under 3:1 against its
 * background, and remove it otherwise, so a normal accent draws as before.
 * @private
 * @returns {boolean} Whether the accent needs the edge
 */
function accentEdge(root, name, accent, bg, text) {
  const faint = !!parseColor(accent) && getContrastRatio(accent, bg) < 3;
  setVar(root, name, faint ? text : null);
  return faint;
}

/**
 * Set or remove a CSS variable on <html>, only when that changes it. The
 * theme observer watches the style attribute, so a write of the same value
 * would start another sync.
 * @private
 * @param {HTMLElement} root - The <html> element
 * @param {string} name - Variable name
 * @param {string|null} value - New value, null to remove it
 */
function setVar(root, name, value) {
  if (root.style.getPropertyValue(name) === (value ?? "")) return;
  if (value === null) root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/**
 * CSS variables syncTheme() writes on <html>. The first ten always get a
 * value, in this order, and the rest only for some colours.
 */
const THEME_VARS = [
  "--dv-bg",
  "--dv-panel-bg",
  "--dv-text-color",
  "--dv-page-bg",
  "--dv-page-text",
  "--dv-page-muted",
  "--dv-muted-text",
  "--dv-accent",
  "--dv-on-accent",
  "--dv-accent-fill",
  "--dv-accent-edge",
  "--dv-page-edge",
  "--dv-search-ring",
  "--dv-toggle-track",
];

/**
 * Apply theme to CSS variables
 */
export function syncTheme() {
  const theme = detectTheme();
  const root = document.documentElement;
  if (htmlHadStyle === null) htmlHadStyle = root.hasAttribute("style");

  // Each value goes to the THEME_VARS entry at the same index, so keep the
  // two lists in the same order
  [
    theme.bg, // --dv-bg
    // --dv-panel-bg: panels over the diagram take the solid colour seen, so
    // their text keeps its contrast when the canvas lets the page show through
    theme.seenBg,
    theme.text, // --dv-text-color
    // --dv-page-bg and --dv-page-text: the page toolbar and error box follow
    // the page, not the canvas
    theme.pageBg,
    theme.pageText,
    // --dv-page-muted: the header title, faded toward the page as far as it
    // keeps 4.5:1
    mutedText(theme.pageText, theme.pageBg),
    mutedText(theme.text, theme.seenBg), // --dv-muted-text
    theme.accent, // --dv-accent
    theme.onAccent, // --dv-on-accent
    accentFill(theme.accent), // --dv-accent-fill
  ].forEach((value, i) => setVar(root, THEME_VARS[i], value));

  // An accent under 3:1 against what it sits on hides the selected
  // buttons, the focus ring and the menu button. The colour stays, and
  // those get an edge in the text colour, in the viewer and on the page.
  const { accent } = theme;
  const canvasEdge = accentEdge(root, "--dv-accent-edge", accent, theme.seenBg, theme.text);
  const pageEdge = accentEdge(root, "--dv-page-edge", accent, theme.pageBg, theme.pageText);
  const key = "accent|" + accent;
  if ((canvasEdge || pageEdge) && !BUILT_IN_ACCENTS.includes(accent) && !warnedContrast.has(key)) {
    warnedContrast.add(key);
    console.warn(
      `DiagView: accent colour ${accent} is hard to see on the background ${canvasEdge ? theme.seenBg : theme.pageBg}, under 3:1. Selected buttons, the focus ring and the menu button get an edge in the text colour.`,
    );
  }

  // The search outline follows the canvas, never the diagram's own colours.
  // Pick whichever ring colour stands out more against the canvas.
  const { SEARCH_RING_LIGHT: ringLight, SEARCH_RING_DARK: ringDark } = COLORS;
  const darkCanvas =
    parseColor(theme.bg) && colorAlpha(theme.bg) >= 1
      ? getContrastRatio(ringDark, theme.bg) > getContrastRatio(ringLight, theme.bg)
      : theme.isDark;
  setVar(root, "--dv-search-ring", darkCanvas ? ringDark : ringLight);

  // The menu toggle track is a faint white wash that only shows on dark
  // canvases. Light canvases get a solid grey so the switch stays visible.
  setVar(root, "--dv-toggle-track", darkCanvas ? null : COLORS.TOGGLE_TRACK_LIGHT);

  // Update modal if exists
  const modal = document.getElementById("diagview-modal");
  if (modal) {
    modal.style.color = theme.text;
    // The minimap image baked in the old text colour for currentColor parts
    if (state.minimapSvg) {
      loadChunk("minimap", () => import("../features/lazy/minimap.js"))
        .then((m) => m.refreshMinimapColour())
        .catch(() => {});
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

  // Watch DOM changes. Turbo and similar routers replace the whole <body>,
  // so the children of <html> are watched too, and a new <body> is watched
  // in place of the old one.
  let watchedBody = null;
  const watch = () => {
    const observer = /** @type {MutationObserver} */ (state.themeObserver);
    observer.disconnect();
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-bs-theme", "style"],
      childList: true,
    });
    watchedBody = document.body;
    if (watchedBody) {
      observer.observe(watchedBody, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      });
    }
  };

  state.themeObserver = new MutationObserver((records) => {
    const newBody = document.body !== watchedBody;
    if (newBody) watch();
    // Other children of <html> coming and going say nothing about the theme
    if (newBody || records.some((r) => r.type === "attributes")) debouncedSync();
  });
  watch();

  // Watch system theme preference, where the browser can report it
  if (!window.matchMedia) return;
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
  THEME_VARS.forEach((name) => root.style.removeProperty(name));
  removeEmptyAttr(root, "style", htmlHadStyle !== false);
  htmlHadStyle = null;

  clearThemeCache();
}
