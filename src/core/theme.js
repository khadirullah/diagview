/**
 * DiagView Theme Detection and Synchronization
 * OPTIMIZED with robust contrast checking and multiple fallbacks
 * @module core/theme
 */

import { state } from "./config.js";
import { TIMING, COLORS } from "./constants.js";
import { debounce } from "./utils.js";

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

/**
 * Parse color string to RGB array
 * @private
 */
function parseColor(color) {
  if (!color) return null;

  const trimmed = color.trim().toLowerCase();

  // 1. Hex color (Fast path)
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
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
  if (trimmed.startsWith("rgb")) {
    const match = trimmed.match(/\d+/g);
    return match ? match.slice(0, 3).map(Number) : null;
  }

  // 3. Named colors - convert via CSS computed style (Faster than Canvas)
  // OPT-7: Use a targeted cache for named colors to prevent layout thrashing
  if (NAMED_COLOR_CACHE.has(trimmed)) {
    return NAMED_COLOR_CACHE.get(trimmed);
  }

  if (!state.colorParserEl && typeof document !== "undefined") {
    // Use <meta> instead of <div> and append to <html> to avoid body layout flushes
    state.colorParserEl = document.createElement("meta");
    state.colorParserEl.setAttribute("aria-hidden", "true");
    state.colorParserEl.style.cssText =
      "display:none!important;position:absolute!important;visibility:hidden!important;";
    document.documentElement.appendChild(state.colorParserEl);
  }

  if (state.colorParserEl) {
    state.colorParserEl.style.color = trimmed;
    const computed = getComputedStyle(state.colorParserEl).color;
    // Returns "rgb(r, g, b)"
    const match = computed.match(/\d+/g);
    const result = match ? match.slice(0, 3).map(Number) : null;

    if (result) {
      NAMED_COLOR_CACHE.set(trimmed, result);
    }
    return result;
  }

  return null;
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.0)
 * @private
 */
function getContrastRatio(color1, color2) {
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
 * Ensure color has sufficient contrast against background
 * @private
 */
function ensureContrast(foreground, background, minRatio = 4.5) {
  const ratio = getContrastRatio(foreground, background);

  if (ratio >= minRatio) {
    return foreground;
  }

  // Fallback to high contrast
  const bgRgb = parseColor(background);
  if (!bgRgb) return foreground;

  const bgLum = getLuminance(...bgRgb);

  // If background is dark, use white; if light, use black
  return bgLum > 0.5 ? "#000000" : "#ffffff";
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

  // Try standard variable name
  let value = root.getPropertyValue(varName) || body.getPropertyValue(varName);

  // Try without dashes (some frameworks)
  if (!value || !value.trim()) {
    const altName = varName.replace(/^--/, "");
    value = root.getPropertyValue(`--${altName}`) || body.getPropertyValue(`--${altName}`);
  }

  // Use fallback
  if (!value || !value.trim()) {
    return isDark ? fallbackDark : fallbackLight;
  }

  return value.trim();
}

/**
 * Detect background color with multiple fallback strategies
 * @private
 */
function detectBackground(isDark) {
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
      getCSSVariable("--background", null, null, isDark) ||
      getCSSVariable("--bg-color", null, null, isDark) ||
      getCSSVariable("--body-bg", null, null, isDark);
  }

  // Use default
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
    bg = isDark ? COLORS.BG_DARK : COLORS.BG_LIGHT;
  }

  return bg;
}

/**
 * Enhanced theme detection with caching and robust fallbacks
 * @returns {object} Theme object with isDark, bg, text, accent
 */
export function detectTheme() {
  if (typeof window === "undefined") {
    return {
      isDark: false,
      bg: COLORS.BG_LIGHT,
      text: COLORS.TEXT_LIGHT,
      accent: COLORS.ACCENT_LIGHT,
    };
  }

  // Return cached theme if fresh
  const now = Date.now();
  if (state.themeCache && now - state.themeCacheTimestamp < CACHE_DURATION) {
    return state.themeCache;
  }

  const isDark = isDarkMode();
  const bg = detectBackground(isDark);

  // Detect text color with multiple fallbacks
  let text = getCSSVariable("--diagram-text", COLORS.TEXT_LIGHT, COLORS.TEXT_DARK, isDark);

  // Fallback to other common variable names
  if (!text || text === "inherit") {
    text =
      getCSSVariable("--text-color", COLORS.TEXT_LIGHT, COLORS.TEXT_DARK, isDark) ||
      getCSSVariable("--foreground", COLORS.TEXT_LIGHT, COLORS.TEXT_DARK, isDark);
  }

  // Ensure sufficient contrast (WCAG AA: 4.5:1)
  const contrast = getContrastRatio(bg, text);
  if (contrast < 4.5) {
    console.warn(
      `DiagView: Low contrast detected (${contrast.toFixed(2)}:1), using high-contrast fallback`,
    );
    text = ensureContrast(text, bg);
  }

  // Detect accent color
  const accent =
    getCSSVariable("--diagram-accent", COLORS.ACCENT_LIGHT, COLORS.ACCENT_DARK, isDark) ||
    getCSSVariable("--primary", COLORS.ACCENT_LIGHT, COLORS.ACCENT_DARK, isDark) ||
    getCSSVariable("--accent-color", COLORS.ACCENT_LIGHT, COLORS.ACCENT_DARK, isDark);

  const theme = { isDark, bg, text, accent };

  // Cache theme
  state.themeCache = theme;
  state.themeCacheTimestamp = now;

  // Store in sessionStorage for persistence
  if (state.isStorageAvailable) {
    try {
      const safe = {
        isDark: !!theme.isDark,
        bg: String(theme.bg || ""),
        text: String(theme.text || ""),
        accent: String(theme.accent || ""),
      };
      sessionStorage.setItem("diagview-theme", JSON.stringify(safe));
    } catch (e) {
      // Ignore storage errors (safety fallback)
    }
  }

  return theme;
}

/**
 * Apply theme to CSS variables
 */
export function syncTheme() {
  const theme = detectTheme();
  const root = document.documentElement;

  // Update CSS variables
  root.style.setProperty("--dv-bg", theme.bg);
  root.style.setProperty("--dv-text-color", theme.text);
  root.style.setProperty("--dv-accent", theme.accent);

  // Update modal if exists
  const modal = document.getElementById("diagview-modal");
  if (modal) {
    modal.style.backgroundColor = theme.bg;
    modal.style.color = theme.text;
  }

  // Update help box
  const help = document.getElementById("diagview-help");
  if (help) {
    help.style.backgroundColor = theme.bg;
    help.style.color = theme.text;
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

export function setupThemeWatchers() {
  if (state.themeObserver) return;

  const debouncedSync = debounce(() => {
    clearThemeCache();
    syncTheme();
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

  clearThemeCache();
}
