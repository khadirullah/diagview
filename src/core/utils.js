import { TIMING } from "./constants.js";
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

/** @typedef {import("./sanitize.js").SanitizeOptions} SanitizeOptions */
/** @typedef {import("./sanitize.js").RemovedCode} RemovedCode */

/**
 * Check if code is running in browser
 */
export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

let isMobileCache = null;

// Cached screenToClientMatrix() result and the view it was measured in
let _screenFix;
let _screenView = "";

let watchingViewport = false;

const forgetViewport = () => {
  isMobileCache = null;
  _screenFix = undefined;
};

/**
 * Start or stop watching the window for a resize or a turn of the device.
 * isMobileDevice() and getClientCTM() call watchViewport(true) when they
 * first cache an answer, and a resize then drops their cached answers.
 * watchViewport(false), run by destroy(), removes the listeners and drops
 * the cached answers too.
 * @param {boolean} on - true to listen, false to stop and forget the answers
 */
export function watchViewport(on) {
  if (!on) forgetViewport();
  if (watchingViewport === on) return;
  watchingViewport = on;
  ["resize", "orientationchange"].forEach((type) =>
    window[on ? "addEventListener" : "removeEventListener"](type, forgetViewport),
  );
}

/**
 * Detect if device is mobile/touch-capable
 */
export function isMobileDevice() {
  if (isMobileCache !== null) return isMobileCache;
  if (!isBrowser()) return false;
  watchViewport(true);
  isMobileCache =
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.matchMedia?.("(max-width: 768px)").matches;
  return isMobileCache;
}

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
 * Download a file from URL
 */
export function downloadFile(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (url.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(url), TIMING.RESOURCE_REVOKE_DELAY);
  }
}

/**
 * Check if the clipboard can take an image. Copy Image needs both
 * clipboard.write and ClipboardItem, so a page that has only one gets the
 * download in place of an error.
 */
export function isClipboardAvailable() {
  return (
    isBrowser() &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem === "function"
  );
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
 * Lazy load script
 */
/**
 * Registry for in-flight script load promises to prevent redundant requests.
 * @private
 */
const SCRIPT_PROMISES = new Map();

/**
 * Page tags for a URL that failed while loadScript waited for them
 * @private
 */
const FAILED_SCRIPTS = new WeakSet();

/**
 * Whether a script has defined the global `name`. The browser also puts an
 * element with id="name" on window, so an element does not count.
 * @param {string} name - Global name, such as "jspdf"
 * @returns {boolean} True when a script defined it
 * @private
 */
function hasScriptGlobal(name) {
  const value = window[name];
  return value !== undefined && !(value instanceof Element || value instanceof HTMLCollection);
}

/**
 * Lazy load script with synchronization to prevent thundering herd race conditions.
 *
 * @param {string} url - Script URL
 * @param {string|null} [integrity=null] - SRI hash
 * @param {string} [globalName] - Global the script defines, such as "jspdf".
 *   A page tag that has loaded without it counts as failed.
 * @returns {Promise<void>} Rejects when the script fails to load or takes
 *   longer than TIMING.SCRIPT_LOAD_TIMEOUT. A <script> for the URL that the
 *   page already has resolves once it has loaded, or at once when the
 *   global it defines is there. A failed load leaves no
 *   tag behind, so the next call tries again.
 */
export function loadScript(url, integrity = null, globalName) {
  if (!isBrowser()) return Promise.resolve();

  const absoluteUrl = new URL(url, window.location.href).href;

  // Return existing promise if this URL is already being loaded
  if (SCRIPT_PROMISES.has(absoluteUrl)) {
    return SCRIPT_PROMISES.get(absoluteUrl);
  }

  // MEM-2: Prevent memory leaks by capping the script cache size
  const MAX_SCRIPT_CACHE = 20;
  if (SCRIPT_PROMISES.size >= MAX_SCRIPT_CACHE) {
    const firstKey = SCRIPT_PROMISES.keys().next().value;
    SCRIPT_PROMISES.delete(firstKey);
  }

  const promise = new Promise((resolve, reject) => {
    // A tag another part of the page added. Its download has a timing
    // entry once it is over, and one that failed has an entry too, so the
    // global it defines decides. One still loading gets waited for.
    let script = Array.from(document.scripts).find(
      (s) => s.src === absoluteUrl && !FAILED_SCRIPTS.has(s),
    );
    // The global alone shows the tag has run, as a page that calls
    // performance.clearResourceTimings() leaves no timing entry.
    if (script && globalName && hasScriptGlobal(globalName)) {
      resolve();
      return;
    }
    if (script && performance.getEntriesByName?.(absoluteUrl).length) {
      if (!globalName) {
        resolve();
        return;
      }
      FAILED_SCRIPTS.add(script);
      script = undefined;
    }

    const addedHere = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = url;
      script.async = true;
      if (integrity) {
        script.integrity = integrity;
        script.crossOrigin = "anonymous";
      }
      document.head.appendChild(script);
    }
    // A const copy for the listeners below, as script is reassigned above
    const tag = script;

    /** @param {string} message - Why it failed */
    const fail = (message) => {
      clearTimeout(timer);
      // Our own tag goes, so the next call adds a fresh one. A page tag
      // stays, and the next call stops waiting for it.
      if (addedHere) tag.remove();
      else FAILED_SCRIPTS.add(tag);
      reject(new Error(message));
    };

    // A stalled download fails after a while so the caller can fall back
    const timer = setTimeout(
      () => fail(`Timed out loading script: ${url}`),
      TIMING.SCRIPT_LOAD_TIMEOUT,
    );
    tag.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    });
    tag.addEventListener("error", () => {
      let errorMsg = `Failed to load script: ${url}`;
      if (integrity) {
        errorMsg += ". This may be due to a Subresource Integrity (SRI) mismatch.";
      }
      fail(errorMsg);
    });
  });

  // Store promise to synchronize other callers
  SCRIPT_PROMISES.set(absoluteUrl, promise);

  // If the load fails, remove it from the cache to allow retries later
  promise.catch(() => SCRIPT_PROMISES.delete(absoluteUrl));

  return promise;
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
/**
 * Robust dimension calculator
 * Prioritizes BBox to ensure we capture the actual visible content area,
 * preventing alignment issues if the diagram doesn't start at 0,0.
 *
 * @param {SVGSVGElement} svg - The SVG element
 * @returns {object} Dimensions object {x, y, w, h, src}
 */
export function getRobustDimensions(svg) {
  if (!svg) return { x: 0, y: 0, w: 0, h: 0, src: "none" };

  // 1. Try BBox (Best for centering content)
  // We prioritize this because we want to know where the *ink* is, not just the canvas size.
  try {
    const bbox = svg.getBBox();
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height, src: "bbox" };
    }
  } catch (e) {
    // Ignore BBox errors (e.g. if not attached to DOM)
  }

  // 2. Try viewBox
  if (svg.hasAttribute("viewBox")) {
    // Numbers may be split by spaces, commas or both, as in "0, 0, 10, 10"
    const vb = (svg.getAttribute("viewBox") || "")
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      return { x: vb[0], y: vb[1], w: vb[2], h: vb[3], src: "viewBox" };
    }
  }

  // 3. Fallback to bounding client rect
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { x: 0, y: 0, w: rect.width, h: rect.height, src: "rect" };
  }

  console.warn("DiagView: Could not determine SVG dimensions. Using 400x300 fallback.");
  return { x: 0, y: 0, w: 400, h: 300, src: "fallback" };
}

/**
 * Adjust an SVG's viewBox to center its actual content (ink)
 * This fixes diagrams with internal offsets (like Mermaid) without
 * breaking the browser's native 'fit-to-container' scaling.
 *
 * @param {SVGSVGElement} svg - The SVG diagram to adjust
 */
export function centerSVGViewBox(svg) {
  const d = getRobustDimensions(svg);
  if (d.w === 0 || d.h === 0) return;

  // Add 5% padding to ensure edges aren't tight
  const padding = Math.max(d.w, d.h) * 0.05;
  const vx = d.x - padding;
  const vy = d.y - padding;
  const vw = d.w + padding * 2;
  const vh = d.h + padding * 2;

  svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

/**
 * Screen pixels -> client pixels, or null when the two already agree.
 *
 * WebKit scales getScreenCTM() by the page zoom (a pinch zoom, or a phone
 * showing a page without a viewport meta tag at its zoomed-out initial
 * scale), while getBoundingClientRect() and mouse clientX/Y stay in layout
 * pixels. Chromium and Gecko report both in the same pixels. A hidden
 * 100x100 SVG without a viewBox is measured both ways to get the mapping.
 *
 * @returns {{a: number, b: number, c: number, d: number, e: number, f: number}|null}
 *   The correction, or null if none is needed
 * @private
 */
function screenToClientMatrix() {
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  probe.setAttribute("width", "100");
  probe.setAttribute("height", "100");
  probe.style.cssText =
    "position:absolute;left:0;top:0;width:100px;height:100px;margin:0;padding:0;" +
    "border:0;transform:none;visibility:hidden;pointer-events:none";
  // Outside <body>, so the diagram MutationObserver never sees it
  document.documentElement.appendChild(probe);
  try {
    const m = probe.getScreenCTM?.();
    const r = probe.getBoundingClientRect();
    if (!m || !r.width || !r.height || !probe.createSVGMatrix) return null;
    const sx = r.width / 100;
    const sy = r.height / 100;
    const agree =
      Math.abs(m.a - sx) < 1e-6 &&
      Math.abs(m.d - sy) < 1e-6 &&
      Math.abs(m.b) < 1e-6 &&
      Math.abs(m.c) < 1e-6 &&
      Math.abs(m.e - r.left) < 1e-3 &&
      Math.abs(m.f - r.top) < 1e-3;
    if (agree) return null;
    // WebKit's SVGPoint.matrixTransform only takes an SVGMatrix, not a
    // DOMMatrix, so stay in SVGMatrix throughout
    const client = Object.assign(probe.createSVGMatrix(), { a: sx, d: sy, e: r.left, f: r.top });
    const { a, b, c, d, e, f } = client.multiply(m.inverse());
    return { a, b, c, d, e, f };
  } finally {
    probe.remove();
  }
}

/**
 * Write Panzoom's current pan and scale to the DOM now. Panzoom applies
 * them on the next frame, and a running transition shows a halfway value,
 * so without this a measurement can see an old view and a new viewBox can
 * paint one frame at the old pan.
 * @param {*} pz - Panzoom instance
 * @param {Element|null} el - The element Panzoom moves
 */
export function applyTransformNow(pz, el) {
  const opts = pz?.getOptions?.();
  if (!el || typeof opts?.setTransform !== "function") return;
  el.style.transition = "none";
  opts.setTransform(el, { ...pz.getPan(), scale: pz.getScale() }, opts);
}

/**
 * An element's getScreenCTM() in client pixels, the space of
 * getBoundingClientRect() and mouse clientX/Y, in every engine.
 *
 * @param {SVGGraphicsElement} el - The SVG element
 * @returns {SVGMatrix|null} The matrix, or null if there is none
 */
export function getClientCTM(el) {
  const ctm = el?.getScreenCTM?.();
  if (!ctm) return null;
  // The probe forces a layout, and panning with the minimap reads CTMs many
  // times a second. Its result only changes with the zoom, size or scroll
  // of the page, so it is measured again only when one of those changed.
  const vv = window.visualViewport;
  const view = [
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    vv?.scale,
    vv?.offsetLeft,
    vv?.offsetTop,
    vv?.width,
    vv?.height,
  ].join();
  if (_screenFix === undefined || view !== _screenView) {
    _screenFix = screenToClientMatrix();
    _screenView = view;
  }
  const svg = el.ownerSVGElement || el;
  if (!_screenFix || !svg.createSVGMatrix) return ctm;
  return Object.assign(svg.createSVGMatrix(), _screenFix).multiply(ctm);
}

/** Extensions that browsers support in requiredExtensions */
const EXTENSIONS = ["http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML"];

/**
 * Whether a child of a <switch> passes its test attributes, the way browsers
 * decide it. requiredFeatures always passes.
 * @param {Element} el - Direct child of a switch
 * @returns {boolean} True when the attributes allow it to be drawn
 */
function passesTests(el) {
  const ext = el.getAttribute("requiredExtensions");
  if (ext !== null) {
    const list = ext.split(/\s+/).filter(Boolean);
    if (!list.length || list.some((x) => !EXTENSIONS.includes(x))) return false;
  }
  const lang = el.getAttribute("systemLanguage");
  if (lang === null) return true;
  const primary = (tag) => tag.trim().split("-")[0].toLowerCase();
  const user = (navigator.languages || [navigator.language]).map(primary);
  return lang.split(",").some((tag) => user.includes(primary(tag)));
}

/**
 * The child of a <switch> that is drawn. A switch draws only its first child
 * that passes its tests, like the HTML label in a draw.io switch, and never
 * the <text> fallback after it.
 * @param {Element} sw - A switch element
 * @returns {Element|undefined} The drawn child, if any passes
 */
export function drawnChild(sw) {
  return [...sw.children].find(passesTests);
}

/**
 * The <switch> that leaves the element undrawn, if one does. Firefox still
 * gives a draw.io <text> fallback a real box, so the box alone cannot tell.
 * @param {Element} el - Element in the diagram
 * @returns {Element|null} The switch that skips it, or null when it is drawn
 */
export function undrawnSwitch(el) {
  for (let n = el; n.parentElement; n = n.parentElement) {
    const parent = n.parentElement;
    if (parent.localName === "switch" && drawnChild(parent) !== n) return parent;
  }
  return null;
}

/**
 * Copy text the old way, through a hidden field and execCommand("copy"),
 * for pages without the Clipboard API. The field is removed again even
 * when execCommand throws.
 * @param {string} text - Text to copy
 * @returns {boolean|undefined} False when the browser refuses to copy,
 *   undefined when it has no execCommand
 */
export function copyText(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand?.("copy");
  } finally {
    field.remove();
  }
}
