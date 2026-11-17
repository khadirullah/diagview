import { isBrowser } from "./env.js";
/**
 * DiagView Utility Functions
 * Framework-agnostic helper functions
 * @module core/utils
 */

// Helpers that live in their own modules, exported here too so existing
// imports keep working
export { inertDocument, sanitizeSVG, sanitizeInPlace } from "./sanitize.js";
export { fixIds } from "./svg-ids.js";
export { debounce, throttle } from "./timing.js";
export {
  getRobustDimensions,
  centerSVGViewBox,
  applyTransformNow,
  getClientCTM,
  drawnChild,
  undrawnSwitch,
} from "./svg-geometry.js";
export {
  isBrowser,
  watchViewport,
  isMobileDevice,
  downloadFile,
  isClipboardAvailable,
  loadScript,
  copyText,
} from "./env.js";

/** @typedef {import("./sanitize.js").SanitizeOptions} SanitizeOptions */
/** @typedef {import("./sanitize.js").RemovedCode} RemovedCode */

/**
 * Remove an attribute DiagView left empty, unless the page had it before.
 * An inline style or class that DiagView set and later cleared stays behind
 * as style="" or class="" otherwise.
 * @param {Element} el - Element to tidy
 * @param {string} name - Attribute name, "style" or "class"
 * @param {boolean} hadIt - Whether the attribute was there before DiagView touched it
 */
export function removeEmptyAttr(el, name, hadIt) {
  if (!hadIt && !el.getAttribute(name)) el.removeAttribute(name);
}

/**
 * Remove DiagView-specific parameters from URL without refreshing
 * Prevents URL pollution and ensures clean bookmarks
 */
export function stripDiagViewParams() {
  if (!isBrowser() || !window.history.replaceState) return;

  // Fast check: Only proceed if URL contains DiagView-specific parameters
  if (!window.location.search.includes("dv-")) return;

  const url = new URL(window.location.href);
  const params = url.searchParams;
  const keysToDelete = Array.from(params.keys()).filter((key) => key.startsWith("dv-"));

  if (keysToDelete.length > 0) {
    // Deleting the last parameter drops the "?" too
    keysToDelete.forEach((key) => params.delete(key));
    window.history.replaceState(null, "", url.toString());
  }
}

/**
 * Generate safe filename from text
 */
export function sanitizeFilename(text, fallback = "diagram") {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_.-]/gu, "");

  return cleaned || fallback;
}

/**
 * The title of a diagram, for the header label, the layout "off" name and
 * export file names. A data-title on the diagram element wins, since
 * someone typed it for that spot. Then the SVG's own <title>, but only a
 * direct child: PlantUML and Graphviz put a <title> on every shape as a
 * tooltip, and the first of those names one shape, such as "Bob", not the
 * diagram. Mermaid writes accTitle there too. Last comes a title drawn on
 * the diagram. Mermaid draws one as text.titleText, or with the chart type
 * in front, such as flowchartTitleText. It sits right in the <svg>, or in
 * a <g> right inside it on a pie chart. Text deeper in, such as a node label
 * or a picture inside an HTML label, never names the diagram.
 * @param {Element} svg - The diagram's SVG
 * @param {Element|null} [element] - The diagram element, when the caller has it
 * @returns {string} The title on one line, or "" when there is none
 */
export function getDiagramTitle(svg, element = svg?.closest("[data-diagview-index]")) {
  // Runs of spaces and line breaks, as in a <title> wrapped in the source,
  // read as one space
  const oneLine = (text) => text?.replace(/\s+/g, " ").trim() || "";
  const dataTitle = oneLine(element?.getAttribute("data-title"));
  if (dataTitle || !svg) return dataTitle;
  const titleEl = Array.from(svg.children).find((el) => el.localName === "title");
  const drawn = Array.from(
    svg.querySelectorAll(
      'text.title, text.titleText, text[class$="TitleText"], text.diagview-title',
    ),
  ).find((el) => el.parentNode === svg || el.parentNode?.parentNode === svg);
  return oneLine(titleEl?.textContent) || oneLine(drawn?.textContent);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The SVG a diagram element shows: the element itself when the selector
 * matched an <svg>, otherwise the first <svg> inside it. An <svg> drawn
 * inside another SVG is part of that drawing and is no diagram of its own.
 * @param {Element|null|undefined} element - Element matched by diagramSelector
 * @returns {SVGSVGElement|null} The diagram's SVG, or null when it has none
 */
export function getDiagramSvg(element) {
  if (element?.localName === "svg" && element.namespaceURI === SVG_NS) {
    return element.parentElement?.namespaceURI === SVG_NS ? null : element;
  }
  return element?.querySelector?.("svg") ?? null;
}

/**
 * SVG elements that draw a shape or a picture. A <use> draws a copy of a
 * shape, often from a sprite elsewhere on the page.
 */
export const SHAPES = "path, rect, circle, ellipse, line, polygon, polyline, image, use";

/**
 * Whether anything is drawn in the SVG yet. An <svg> matched by the
 * selector can sit on the page empty until a library such as D3 fills it.
 * A <foreignObject> draws the HTML inside it.
 * @param {Element} svg - The diagram's SVG
 * @returns {boolean} True once the SVG holds a shape, text or group
 */
export function hasDrawnContent(svg) {
  return !!svg.querySelector(`g, text, foreignObject, ${SHAPES}`);
}

/**
 * Get timestamp string for filenames
 */
export function getTimestamp() {
  const n = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const d = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  const t = `${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}`;
  return `${d}_${t}`;
}

/**
 * Safe query selector all
 */
export function safeQuerySelectorAll(selector, context = document) {
  try {
    return Array.from(context.querySelectorAll(selector));
  } catch (e) {
    console.warn(`DiagView: Invalid selector "${selector}"`, e);
    return [];
  }
}

/**
 * Check for required dependencies
 */
export function checkPanzoomDependency() {
  // An element with id="Panzoom" also shows up as window.Panzoom
  return typeof window.Panzoom === "function";
}

/**
 * Safely set or inject SVG content without using innerHTML/insertAdjacentHTML sinks.
 * Uses DOMParser to create safe nodes from a string and moves them into the target element.
 *
 * @param {Element} el - Target element
 * @param {string} svgContent - SVG string (can be full <svg> tag or child nodes)
 * @param {'replace'|'append'|'prepend'} [mode='replace'] - Insertion mode
 */
/**
 * Cache for parsed SVG content to avoid redundant DOMParser calls for UI icons.
 * @private
 */
const SVG_CONTENT_CACHE = new Map();

/**
 * Clear the SVG content cache.
 * MEM-1: Prevents memory leaks in long-running SPAs by releasing cached DOM nodes.
 */
export function clearSVGContentCache() {
  SVG_CONTENT_CACHE.clear();
}

/**
 * Safely set SVG content using DOMParser to prevent XSS.
 * Optimized with a caching layer for static strings (icons, UI elements).
 *
 * @param {Element} el - Target element
 * @param {string} svgContent - SVG string content
 * @param {'replace'|'append'|'prepend'} mode - Insertion mode
 */
export function setSVGContent(el, svgContent, mode = "replace") {
  if (!el || !svgContent) return;

  const cacheKey = svgContent.trim();
  let cachedEntry = SVG_CONTENT_CACHE.get(cacheKey);

  if (!cachedEntry) {
    try {
      const parser = new DOMParser();
      let content = cacheKey;

      // Fix: DOMParser requires explicit xmlns namespace for SVG rendering.
      if (content.startsWith("<svg") && !content.includes("xmlns=")) {
        content = content.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const wrappedContent = content.startsWith("<svg")
        ? content
        : `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`;

      const doc = parser.parseFromString(wrappedContent, "image/svg+xml");
      const svgEl = doc.querySelector("svg");

      if (svgEl && !doc.querySelector("parsererror")) {
        cachedEntry = {
          svgEl,
          isInputFullSVG: content.startsWith("<svg"),
        };
      }
      // Cache management: prevent memory leaks by capping cache size (mostly for icons)
      if (SVG_CONTENT_CACHE.size < 100) {
        SVG_CONTENT_CACHE.set(cacheKey, cachedEntry);
      }
    } catch (e) {
      console.error("DiagView: Failed to parse SVG content", e);
      return;
    }
  }

  if (cachedEntry) {
    const { svgEl, isInputFullSVG } = cachedEntry;
    const isTargetSVG =
      el instanceof SVGElement || el.namespaceURI === "http://www.w3.org/2000/svg";

    if (!isTargetSVG && isInputFullSVG) {
      // Use importNode for safe adoption across documents (Parser doc -> Main doc)
      const node = document.importNode(svgEl, true);
      if (mode === "prepend") {
        el.prepend(node);
      } else if (mode === "append") {
        el.append(node);
      } else {
        el.replaceChildren(node);
      }
    } else {
      // Move children nodes safely after cloning them from the cache
      const children = Array.from(svgEl.childNodes).map((child) =>
        document.importNode(child, true),
      );
      if (mode === "prepend") {
        el.prepend(...children);
      } else if (mode === "append") {
        el.append(...children);
      } else {
        el.replaceChildren(...children);
      }
    }
  }
}

/**
 * Generate a unique ID for diagram instances
 * @returns {string} Unique generated ID
 */
export function generateUniqueId() {
  return `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
