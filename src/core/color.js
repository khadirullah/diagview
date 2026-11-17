/**
 * DiagView colour maths
 * Parses colours, measures contrast and picks colours that stay readable.
 * Hex and rgb() parse in plain code, other colours go through the browser.
 * @module core/color
 */

import { state } from "./config.js";
import { COLORS } from "./constants.js";

const NAMED_COLOR_CACHE = new Map();

/**
 * Calculate relative luminance (WCAG 2.0)
 * @private
 */
export function getLuminance(r, g, b) {
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
  // Keep the sign and clamp to 0..255, as the browser does with rgb(-10, 300, 0)
  const match = value.match(/-?\d*\.?\d+/g);
  return match && match.length >= 3
    ? match.slice(0, 3).map((n) => Math.min(255, Math.max(0, Math.round(Number(n)))))
    : null;
}

/**
 * Ask the engine whether a string is a colour at all. CSS.supports() is the
 * authority where it exists; otherwise a detached element's style is used,
 * which drops values it cannot parse. Bare HSL triplets such as
 * "222.2 47.4% 11.2%" (Tailwind/shadcn) are not colours.
 * @private
 */
export function isColor(value) {
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
  if (!isColor(value)) return null;

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
export function accentFill(accent) {
  const rgb = parseColor(accent);
  return rgb && onAccentColor(accent) === "#fff" && getContrastRatio("#fff", accent) < 4.5
    ? darkenForWhite(rgb)
    : accent;
}

/**
 * Read the alpha channel of a colour string.
 * @private
 * @returns {number} Alpha from 0 to 1, and 1 when the colour has none
 */
export function colorAlpha(value) {
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
export function overPage(color, page) {
  const a = colorAlpha(color);
  if (a >= 1) return color;
  const fg = parseColor(color) || [0, 0, 0];
  const under = /** @type {number[]} */ (parseColor(page));
  return `rgb(${[0, 1, 2].map((i) => Math.round(fg[i] * a + under[i] * (1 - a))).join(", ")})`;
}

/**
 * The text colour faded toward the canvas, as far as 30%, while it still
 * reaches 4.5:1. For secondary text such as the menu headings, the
 * search placeholder and the header title on the page. The search box and
 * the header bar lay a faint grey wash over the background, so the colour
 * must pass on that too. On a canvas where the text only just passes it
 * stays at full strength.
 * @param {string} text - Text colour
 * @param {string} bg - Opaque canvas colour
 * @returns {string} The muted colour
 */
export function mutedText(text, bg) {
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
