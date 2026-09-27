/**
 * DiagView Readable Text
 * Recolours diagram labels that are hard to read against what sits behind
 * them on the current canvas. Only the modal clone changes; the page diagram
 * and every export keep the colours the author chose.
 * @module features/lazy/readable-text
 */

import { state } from "../../core/config.js";
import { detectTheme, parseColor, getContrastRatio } from "../../core/theme.js";

/** Original inline value of the recoloured property ("" when there was none) */
const ORIG_ATTR = "data-dv-text-orig";
/** Original inline priority of the recoloured property ("important" or "") */
const PRIO_ATTR = "data-dv-text-prio";

/** WCAG AA for normal text, below this a label is recoloured */
const MIN_CONTRAST = 4.5;
/** WCAG AAA, what a recoloured label aims for so it does not land on a dim grey */
const TARGET_CONTRAST = 7;
/** Lightness change per step while searching for a readable shade */
const LIGHTNESS_STEP = 0.02;
/** A label's own background counts once it is at least this opaque */
const MIN_LABEL_BG_ALPHA = 0.3;

const SHAPE_SELECTOR = "rect, circle, ellipse, polygon, path";
/** Parts of an SVG that are never drawn where they sit, or hold HTML */
const NOT_DRAWN = "defs, marker, clipPath, mask, pattern, foreignObject";

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/**
 * Read the alpha channel of a colour string.
 * @param {string} value - Lower-case CSS colour
 * @returns {number} Alpha from 0 to 1
 */
function readAlpha(value) {
  if (value === "transparent") return 0;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 4) return parseInt(hex[3] + hex[3], 16) / 255;
    if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
    return 1;
  }
  let alpha = null;
  if (/^rgba?\(/.test(value)) alpha = value.match(/[\d.]+%?/g)?.[3];
  else if (value.includes("/"))
    alpha = value
      .split("/")
      .pop()
      .match(/[\d.]+%?/)?.[0];
  if (!alpha) return 1;
  return alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
}

/**
 * Parse a paint or colour to [r, g, b, a].
 * @param {string} value - CSS colour or SVG paint
 * @returns {number[]|null} null for "none", url() paints, fully transparent or unknown values
 */
function toRgba(value) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed || trimmed === "none" || trimmed.startsWith("url(")) return null;
  const alpha = readAlpha(trimmed);
  if (!(alpha > 0)) return null;
  const rgb = parseColor(trimmed);
  return rgb ? [...rgb, Math.min(alpha, 1)] : null;
}

/**
 * Composite a colour over an opaque one.
 * @param {number[]} fg - [r, g, b, a]
 * @param {number[]} bg - [r, g, b]
 * @returns {number[]} Opaque [r, g, b]
 */
function blend(fg, bg) {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
}

const toCss = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
const contrast = (a, b) => getContrastRatio(toCss(a), toCss(b));

/**
 * @param {number[]} rgb - [r, g, b]
 * @returns {number[]} [hue in degrees, saturation 0-1, lightness 0-1]
 */
function toHsl(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * @param {number[]} hsl - [hue in degrees, saturation 0-1, lightness 0-1]
 * @returns {number[]} [r, g, b]
 */
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/**
 * Shade of the label's own colour that reads on the background. Hue and
 * saturation stay, lightness moves away from the background, so red text on
 * a dark canvas turns light red instead of white.
 * @param {number[]} fg - Label colour [r, g, b, a]
 * @param {number[]} bg - Opaque background [r, g, b]
 * @returns {number[]} Opaque [r, g, b]
 */
function readableShade(fg, bg) {
  const lighter = contrast(WHITE, bg) >= contrast(BLACK, bg);
  const [h, s, l] = toHsl(fg);
  let next = l;
  while (lighter ? next < 1 : next > 0) {
    next = lighter ? Math.min(1, next + LIGHTNESS_STEP) : Math.max(0, next - LIGHTNESS_STEP);
    const rgb = fromHsl([h, s, next]);
    if (contrast(rgb, bg) >= TARGET_CONTRAST) return rgb;
  }
  return lighter ? WHITE : BLACK;
}

/**
 * The property that paints a label. SVG text uses fill, HTML labels inside
 * a foreignObject use color.
 * @param {Element} el - Label element
 * @returns {"fill"|"color"} Property name
 */
function paintProp(el) {
  return el.closest("foreignObject") ? "color" : "fill";
}

/**
 * Whether the element holds text of its own, not only through children.
 * @param {Element} el - Candidate element
 * @returns {boolean} True when a direct child text node has visible text
 */
function hasOwnText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
  }
  return false;
}

/**
 * Every element that draws text of its own: SVG text and tspan, and HTML
 * elements inside a foreignObject (Mermaid htmlLabels, draw.io). A text
 * whose characters all sit in tspans is skipped, since the tspans paint them.
 * @param {SVGElement} svg - Diagram SVG
 * @returns {Element[]} Label elements
 */
function collectLabels(svg) {
  const labels = [];
  for (const el of svg.querySelectorAll("text, tspan")) {
    if (!el.closest(NOT_DRAWN) && hasOwnText(el)) labels.push(el);
  }
  for (const el of svg.querySelectorAll("foreignObject *")) {
    if (hasOwnText(el)) labels.push(el);
  }
  return labels;
}

/**
 * Filled shapes with their screen boxes. A shape painted with a gradient or
 * pattern keeps paint null, since its colour behind a label is unknown.
 * @param {SVGElement} svg - Diagram SVG
 * @returns {Array<{box: DOMRect, area: number, paint: number[]|null}>} Measured shapes
 */
function measureShapes(svg) {
  const shapes = [];
  for (const el of svg.querySelectorAll(SHAPE_SELECTOR)) {
    if (el.closest(NOT_DRAWN)) continue;
    const style = getComputedStyle(el);
    const fill = (style.fill || "").trim();
    let paint = null;
    if (!fill.startsWith("url(")) {
      paint = toRgba(fill);
      if (!paint) continue;
      const opacity = parseFloat(style.fillOpacity);
      if (opacity >= 0 && opacity < 1) paint[3] *= opacity;
      if (!paint[3]) continue;
    }
    const box = el.getBoundingClientRect();
    const area = box.width * box.height;
    if (area) shapes.push({ box, area, paint });
  }
  return shapes;
}

/**
 * What sits behind a label: its own HTML background, else the smallest
 * filled shape under its centre, else the canvas.
 * @param {Element} el - Label element
 * @param {string} prop - "fill" or "color"
 * @param {DOMRect} box - Label box
 * @param {number[]} canvas - Opaque canvas colour
 * @param {() => Array<*>} getShapes - Shapes of the diagram, measured on first use
 * @returns {number[]|null} Opaque [r, g, b], or null when it cannot be known
 */
function backgroundOf(el, prop, box, canvas, getShapes) {
  // HTML labels can carry their own background (Mermaid edge labels do)
  if (prop === "color") {
    for (let n = el; n && n.localName !== "foreignObject"; n = n.parentElement) {
      const own = toRgba(getComputedStyle(n).backgroundColor);
      if (own && own[3] > MIN_LABEL_BG_ALPHA) return blend(own, canvas);
    }
  }

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  let best = null;
  for (const shape of getShapes()) {
    const { box: r, area } = shape;
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) continue;
    if (!best || area < best.area) best = shape;
  }
  if (!best) return canvas;
  return best.paint ? blend(best.paint, canvas) : null;
}

/**
 * Recolour one label and remember what it had inline.
 * @param {Element} el - Label element
 * @param {string} prop - "fill" or "color"
 * @param {string} value - New colour
 */
function recolour(el, prop, value) {
  el.setAttribute(ORIG_ATTR, el.style.getPropertyValue(prop));
  el.setAttribute(PRIO_ATTR, el.style.getPropertyPriority(prop));
  // !important: Mermaid colours text through id-scoped rules
  el.style.setProperty(prop, value, "important");
}

/**
 * Put back every colour this module changed in the SVG, including the
 * original inline value and its priority.
 * @param {SVGElement} svg - Diagram SVG
 */
export function restoreText(svg) {
  if (!svg) return;
  for (const el of svg.querySelectorAll(`[${ORIG_ATTR}]`)) {
    const prop = paintProp(el);
    const orig = el.getAttribute(ORIG_ATTR);
    if (orig) el.style.setProperty(prop, orig, el.getAttribute(PRIO_ATTR) || "");
    else el.style.removeProperty(prop);
    el.removeAttribute(ORIG_ATTR);
    el.removeAttribute(PRIO_ATTR);
    if (el.getAttribute("style") === "") el.removeAttribute("style");
  }
}

/**
 * Recolour the labels that are hard to read against what sits behind them.
 * Starts from the author's colours, so calling it again never stacks.
 * @param {SVGElement} svg - Diagram SVG in the modal
 * @param {string} canvasBg - Opaque canvas colour as seen. A see-through
 *   value is laid over white, so pass the theme's seenBg instead.
 * @returns {number} Number of labels recoloured
 */
export function applyReadableText(svg, canvasBg) {
  if (!svg) return 0;
  restoreText(svg);

  const canvasRgba = toRgba(canvasBg);
  if (!canvasRgba) return 0;
  const canvas = blend(canvasRgba, WHITE);

  let shapes = null;
  const getShapes = () => shapes || (shapes = measureShapes(svg));

  // Read everything first and write afterwards, so the loop never forces a
  // fresh layout per label
  const changes = [];
  for (const el of collectLabels(svg)) {
    // Not drawn, like the <text> fallback in a draw.io <switch>
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;

    const prop = paintProp(el);
    const fg = toRgba(getComputedStyle(el)[prop]);
    if (!fg) continue;

    const bg = backgroundOf(el, prop, box, canvas, getShapes);
    if (!bg || contrast(blend(fg, bg), bg) >= MIN_CONTRAST) continue;

    changes.push({ el, prop, value: toCss(readableShade(fg, bg)) });
  }

  for (const { el, prop, value } of changes) recolour(el, prop, value);
  return changes.length;
}

/**
 * Run fn with the author's colours back in place, then recolour again.
 * Exports read computed styles synchronously, so fn sees the original
 * diagram and the reader sees no change.
 * @template T
 * @param {SVGElement} svg - Diagram SVG
 * @param {() => T} fn - Synchronous work that must see the original colours
 * @returns {T} Whatever fn returns
 */
export function withOriginalText(svg, fn) {
  const changed = [...svg.querySelectorAll(`[${ORIG_ATTR}]`)].map((el) => {
    const prop = paintProp(el);
    return { el, prop, value: el.style.getPropertyValue(prop) };
  });
  restoreText(svg);
  try {
    return fn();
  } finally {
    for (const { el, prop, value } of changed) recolour(el, prop, value);
  }
}

/**
 * Bring the modal diagram in line with state.readableText.
 * @param {string} [canvasBg] - Canvas colour as seen, detected when omitted
 * @returns {number} Number of labels recoloured
 */
export function syncReadableText(canvasBg) {
  const viewport = document.getElementById("diagview-modal-viewport");
  const svg = viewport?.querySelector("svg");
  if (!svg) return 0;
  if (!state.readableText) {
    restoreText(svg);
    return 0;
  }
  // A see-through canvas shows the page, so measure against what is seen
  return applyReadableText(svg, canvasBg || detectTheme().seenBg);
}
