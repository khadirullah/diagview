import { TIMING } from "./constants.js";
/**
 * DiagView Utility Functions
 * Framework-agnostic helper functions
 * @module core/utils
 */

/**
 * Check if code is running in browser
 */
export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

let isMobileCache = null;

if (isBrowser()) {
  const invalidate = () => {
    isMobileCache = null;
  };
  window.addEventListener("resize", invalidate);
  window.addEventListener("orientationchange", invalidate);
}

/**
 * Detect if device is mobile/touch-capable
 */
export function isMobileDevice() {
  if (isMobileCache !== null) return isMobileCache;
  if (!isBrowser()) return false;
  isMobileCache =
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.matchMedia?.("(max-width: 768px)").matches;
  return isMobileCache;
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
    keysToDelete.forEach((key) => params.delete(key));
    // Remove trailing ? if no params left
    const newUrl = url.toString().replace(/\?$/, "");
    window.history.replaceState(null, "", newUrl);
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
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  const executedFunction = function (...args) {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
  executedFunction.cancel = function () {
    clearTimeout(timeout);
    timeout = null;
  };
  return executedFunction;
}

/**
 * Throttle function execution with trailing-edge support
 * @param {Function} func - Function to throttle
 * @param {number} limit - Throttle limit in ms
 * @returns {any|undefined} - Function result if executed, undefined if throttled
 */
export function throttle(func, limit) {
  let inThrottle;
  let lastFunc;
  let lastResult;
  let timeout;

  const throttledFunc = function (...args) {
    const context = this;
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      timeout = setTimeout(() => {
        inThrottle = false;
        if (lastFunc) {
          lastResult = func.apply(lastFunc.context, lastFunc.args);
          lastFunc = null;
        }
      }, limit);
      return lastResult;
    } else {
      lastFunc = { context, args };
      return undefined;
    }
  };

  throttledFunc.cancel = function () {
    clearTimeout(timeout);
    inThrottle = false;
    lastFunc = null;
  };

  return throttledFunc;
}

/**
 * Check if clipboard API is available
 */
export function isClipboardAvailable() {
  return isBrowser() && navigator.clipboard && typeof navigator.clipboard.write === "function";
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
 * Lazy load script with synchronization to prevent thundering herd race conditions.
 *
 * @param {string} url - Script URL
 * @param {string|null} [integrity=null] - SRI hash
 * @returns {Promise<void>}
 */
export function loadScript(url, integrity = null) {
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
    // Check if already loaded by another part of the app (non-DiagView)
    const isAlreadyLoaded = Array.from(document.scripts).some((s) => s.src === absoluteUrl);
    if (isAlreadyLoaded) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }

    script.onload = () => resolve();
    script.onerror = () => {
      let errorMsg = `Failed to load script: ${url}`;
      if (integrity) {
        errorMsg += ". This may be due to a Subresource Integrity (SRI) mismatch.";
      }
      reject(new Error(errorMsg));
    };

    document.head.appendChild(script);
  });

  // Store promise to synchronize other callers
  SCRIPT_PROMISES.set(absoluteUrl, promise);

  // If the load fails, remove it from the cache to allow retries later
  promise.catch(() => SCRIPT_PROMISES.delete(absoluteUrl));

  return promise;
}

/**
 * Tag blocklist for PERMISSIVE mode.
 * Covers only the most critical, universally-dangerous injection tags.
 * This matches the legacy (v0.x) sanitization behavior.
 * @private
 */
const PERMISSIVE_BLOCKED_TAGS = new Set(["script", "iframe", "object", "applet", "embed", "form"]);

/**
 * Tag blocklist for STRICT mode (default).
 * Extends PERMISSIVE by also blocking SVG-specific animation, filter,
 * and embedding vectors commonly used in modern SVG XSS attacks.
 * @private
 */
const STRICT_BLOCKED_TAGS = new Set([
  ...PERMISSIVE_BLOCKED_TAGS,
  // "foreignobject", // MOVED to conditional check in cleanElement to support Mermaid labels
  "math",
  "feimage",
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
  "mpath",
  "tref",
]);

/**
 * SMIL animation elements. Strict mode drops them all; permissive mode
 * keeps them unless they rewrite a URL-bearing or event attribute, since
 * <animate attributeName="href" values="javascript:..."> is as dangerous
 * as the attribute itself.
 * @private
 */
const ANIMATION_TAGS = new Set([
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "set",
]);

/**
 * True when an animation element targets href/xlink:href (any prefix) or
 * an on* event handler attribute. attributeName is compared case- and
 * prefix-insensitively so "HREF" and "xl:href" are caught too.
 * @private
 */
function animatesDangerousAttribute(el) {
  const target = (el.getAttribute("attributeName") || "").trim().toLowerCase();
  const local = target.slice(target.lastIndexOf(":") + 1);
  return local === "href" || local.startsWith("on");
}

/**
 * Matches dangerous URL protocols in href/src/action attributes.
 * Blocks javascript:, vbscript:, and data: URIs by default.
 * Test only values passed through normalizeURLValue(); the scheme colon is
 * anchored so benign names like "javascript-guide.html" are not stripped.
 * @private
 */
const DANGEROUS_URL_RE = /^(?:javascript|vbscript|data):/i;

/**
 * Browsers strip ASCII control characters and whitespace (tab, CR, LF, ...)
 * when parsing URLs, so "java\tscript:alert(1)" executes as "javascript:".
 * Normalize attribute values the same way before scheme-testing them,
 * otherwise embedded whitespace bypasses the check.
 * @private
 */
function normalizeURLValue(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0020]/g, "");
}

/**
 * Matches dangerous patterns in inline style attribute values.
 * Covers: CSS expression(), javascript: in url(), and external url() refs.
 * Note: This catches inline style="" attributes only. Content inside <style>
 * block elements is NOT currently sanitized (known limitation — would require
 * a CSS parser to do safely without false positives).
 * @private
 */
/**
 * Patterns that represent active danger (script execution) in CSS.
 * Covers: expression(), javascript:, vbscript:, and hex-encoded bypasses.
 * @private
 */
const INTERNAL_DANGER_RE =
  /(?:javascript:|vbscript:|expression\s*\(|url\s*\(\s*['"]?javascript:|@import\s+['"]?javascript:|(?:\\[0-9a-f]{1,6}\s?)+|\\u[0-9a-f]{4})/i;

/**
 * Decode CSS hex/unicode escapes before pattern-matching.
 * Handles \6a, \000061, \6a  (with trailing space) and \u0041 forms.
 * @private
 */
function decodeCSSEscapes(str) {
  if (!str || !str.includes("\\")) return str;
  return (
    str
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch (e) {
          return "";
        }
      })
      .replace(/\\u([0-9a-fA-F]{4})/gi, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch (e) {
          return "";
        }
      })
      // Single-character escapes (\/ -> "/", \i -> "i") are the literal
      // character in CSS and would otherwise split "//" or "@import".
      .replace(/\\([^0-9a-fA-F\r\n])/g, "$1")
  );
}

/**
 * Remove CSS comments from a string.
 * @private
 */
function stripCSSComments(str) {
  if (!str || !str.includes("/*")) return str;
  return str.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Patterns that represent remote resource loading in CSS.
 * @private
 */
const REMOTE_RESOURCE_RE = /(?:@import\b|url\s*\(\s*['"]?\s*(?:https?:|\/\/))/i;

/**
 * Lower-cased local name of an element or attribute with any namespace
 * prefix removed. DOMParser exposes the prefix separately (localName is
 * already bare); the HTML parser keeps "svg:script" as the localName, so
 * strip up to the last colon in both cases.
 * @param {Element|Attr} node - Element or attribute node
 * @returns {string} Bare lower-case name
 * @private
 */
function localNameOf(node) {
  const raw = node.localName || node.name || node.tagName || "";
  return raw.slice(raw.lastIndexOf(":") + 1).toLowerCase();
}

/**
 * Sanitize an SVG string or DOM Node to prevent XSS.
 *
 * Uses a secure DOM-walking approach (DOMParser + attribute walker) rather
 * than regex-based string replacement, which is trivially bypassed.
 *
 * Three modes are supported:
 * - 'strict'     (default) — Blocks dangerous tags, animation vectors,
 *                            style injection, and external <use> hrefs.
 * - 'permissive'           — Blocks only scripts/iframes/objects and on*
 *                            event attributes. Matches legacy v0.x behavior.
 * - 'off'                  — Returns input unchanged. Use ONLY for SVGs
 *                            from a fully trusted, developer-controlled source.
 *
 * @param {string|Node} input - The SVG string or DOM Node to sanitize.
 * @param {'strict'|'permissive'|'off'} [mode='strict'] - Sanitization mode.
 * @param {number|object} [options=0] - Character limit (number) or options object.
 * @returns {string|Node} The sanitized string or Node.
 */
export function sanitizeSVG(input, mode = "strict", options = 0) {
  const maxChars = typeof options === "number" ? options : options.maxChars || 0;
  const allowRemote = typeof options === "object" ? options.allowRemoteResources : false;
  if (!input) return typeof input === "string" ? "" : input;

  // Hard Block for massive strings (Security/Stability)
  if (maxChars > 0 && typeof input === "string" && input.length > maxChars) {
    console.error(`DiagView: SVG exceeds safety limit of ${maxChars} chars. Processing blocked.`);
    return "";
  }

  // 'off' mode: bypass entirely — caller guarantees source is trusted
  if (mode === "off") return input;

  let root;
  const isString = typeof input === "string";

  if (isString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(input, "image/svg+xml");
      if (doc.querySelector("parsererror")) return "";
      root = doc.documentElement;
    } catch (e) {
      console.error("DiagView: SVG parsing failed", e);
      return "";
    }
  } else if (input instanceof Node) {
    // SEC-2: Ensure we never mutate the original input Node
    root = input.cloneNode(true);
  } else {
    return input;
  }

  const isStrict = mode !== "permissive";
  const blockedTags = isStrict ? STRICT_BLOCKED_TAGS : PERMISSIVE_BLOCKED_TAGS;

  const cleanElement = (el) => {
    if (el.nodeType !== 1) return;

    // Compare the local name so prefixed forms (<svg:script>, <h:iframe>)
    // are treated like their unprefixed counterparts. The HTML parser keeps
    // the prefix inside localName, so strip anything before the last colon.
    const tagName = localNameOf(el);

    // Remove blocked tags entirely — no further processing needed
    if (blockedTags.has(tagName)) {
      el.remove();
      return;
    }

    // Permissive keeps SMIL animations, but never ones that write href or
    // an on* attribute — those are script execution by another route.
    if (!isStrict && ANIMATION_TAGS.has(tagName) && animatesDangerousAttribute(el)) {
      el.remove();
      return;
    }

    // SMART BLOCK: allow <foreignObject> ONLY if it has no src/data/href
    // pointing to external content (the actual XSS vector).
    // This restores Mermaid subgraph labels in strict mode.
    if (isStrict && tagName === "foreignobject") {
      const src = el.getAttribute("src") || el.getAttribute("data") || "";
      if (/^https?:\/\//.test(src)) {
        el.remove();
        return;
      }
    }

    // Snapshot attributes before iteration — live NamedNodeMap shifts
    // indices when attributes are removed, causing items to be skipped.
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      // Local name again: xl:href bound to the XLink namespace, svg:onclick
      const name = localNameOf(attr);
      const value = attr.value;

      // Remove all event handler attributes (onclick, onload, onerror, etc.)
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      // Sanitize URL-bearing attributes for dangerous protocols
      if (["href", "xlink:href", "src", "action"].includes(name)) {
        const normalizedValue = normalizeURLValue(value);
        if (DANGEROUS_URL_RE.test(normalizedValue)) {
          // Allow only safe raster data URIs (PNG, JPG, etc.)
          // This blocks data:image/svg+xml which is an XSS vector.
          const types = options.allowedImageTypes || ["png", "jpeg", "webp", "gif"];
          const typePattern = types.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
          const safeRasterRe = new RegExp(`^data:image\\/(?:${typePattern});base64,`, "i");

          if (!safeRasterRe.test(normalizedValue)) {
            el.removeAttribute(attr.name);
            continue;
          }
        }
        // Strict only: block external URL references on <use> elements.
        // <use xlink:href="https://evil.com/xss.svg#payload"> is a
        // cross-origin SVG injection vector that bypasses same-origin policy.
        // Protocol-relative "//host/..." resolves to an external origin too.
        if (isStrict && tagName === "use" && /^(?:https?:)?\/\//i.test(normalizedValue)) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      // Strict only: sanitize inline style attribute for CSS-based injection.
      if (isStrict && name === "style") {
        const decodedValue = decodeCSSEscapes(value);
        const cleanValue = stripCSSComments(decodedValue);
        const isDangerous =
          INTERNAL_DANGER_RE.test(cleanValue) ||
          (!allowRemote && REMOTE_RESOURCE_RE.test(cleanValue));
        if (isDangerous) {
          el.removeAttribute(attr.name);
          continue;
        }
      }
    }

    // Strict only: sanitize <style> block textContent for CSS-based injection.
    if (isStrict && tagName === "style") {
      const content = el.textContent || "";
      const decodedContent = decodeCSSEscapes(content);
      const cleanContent = stripCSSComments(decodedContent);
      const isDangerous =
        INTERNAL_DANGER_RE.test(cleanContent) ||
        (!allowRemote && REMOTE_RESOURCE_RE.test(cleanContent));
      if (isDangerous) {
        el.remove();
        return;
      }
    }

    // Recurse into children using a snapshotted array (safe against DOM mutation)
    const children = Array.from(el.childNodes);
    for (const child of children) {
      cleanElement(child);
    }
  };

  cleanElement(root);

  return isString ? new XMLSerializer().serializeToString(root) : root;
}

/**
 * Check for required dependencies
 */
export function checkPanzoomDependency() {
  return typeof window.Panzoom !== "undefined";
}

/**
 * url(#id) reference in an attribute value: optional whitespace, optional
 * quote, the fragment, and the matching closing quote. Case-insensitive so
 * URL(#id) is rewritten as well.
 * @private
 */
const URL_REF_RE = /(url\s*\(\s*(['"]?)\s*)#([^)'"]+)(\2\s*\))/gi;

/**
 * "#token" inside a <style> block. The token may contain "." and ":" as
 * well as CSS backslash escapes so ids such as "my.grad" are matched whole
 * (url(#my.grad)) or escaped (#my\.grad selector).
 * @private
 */
const CSS_ID_RE = /#((?:\\.|[a-zA-Z0-9_.:-])+)/g;

/**
 * Fix ID collisions in SVG elements using a secure DOM-walking approach.
 * Replaces the unsafe and slow outerHTML/RegExp strategy with direct attribute manipulation.
 * This prevents XSS (no innerHTML parsing) and is significantly faster.
 *
 * @param {SVGElement} svg - The SVG element to fix
 * @param {string} uniqueId - Unique prefix for IDs
 * @returns {SVGElement} - The modified SVG element
 */
export function fixIds(svg, uniqueId, changes = null) {
  if (!svg || !uniqueId) return svg;

  const idMap = new Map();
  const idElements = svg.querySelectorAll("[id]");

  // 1. Build the ID map and track original element IDs
  if (svg.id) {
    const oldId = svg.id;
    const newId = `${uniqueId}-${oldId}`;
    idMap.set(oldId, newId);
    if (changes && changes.elements) changes.elements.set(svg, oldId);
    svg.id = newId;
  }

  // OPT-6: Avoid Array.from() for large NodeLists, use standard for-loop
  for (let i = 0; i < idElements.length; i++) {
    const el = idElements[i];
    const oldId = el.id;
    const newId = `${uniqueId}-${oldId}`;
    idMap.set(oldId, newId);

    if (changes && changes.elements) {
      changes.elements.set(el, oldId);
    }

    el.id = newId;
  }

  if (idMap.size === 0) return svg;

  // 2. Walk the DOM and update attribute references (url(#id), href, etc.)
  // Optimize: Only query elements that can actually contain ID references (href, fill, filters, etc.)
  // instead of every single node in the SVG tree.
  // [style*='#'] covers inline style="fill:url(#id)" as written by Inkscape,
  // Illustrator and hand-authored SVGs, where no fill/stroke attribute exists.
  const REF_SELECTOR =
    "use,image,pattern,linearGradient,radialGradient,filter,mask,clipPath," +
    "textPath,a,feImage,[aria-labelledby],[aria-describedby]," +
    "[fill*='#'],[stroke*='#'],[filter*='#'],[clip-path*='#'],[mask*='#']," +
    "[marker-start*='#'],[marker-mid*='#'],[marker-end*='#'],[style*='#']";

  const allElements = svg.querySelectorAll(REF_SELECTOR);
  allElements.forEach((el) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const value = attr.value;

      if (!value) continue;

      // Case C: space-separated id lists (no "#" prefix) used by ARIA
      if (attr.name === "aria-labelledby" || attr.name === "aria-describedby") {
        const newList = value
          .split(/\s+/)
          .map((id) => (idMap.has(id) ? idMap.get(id) : id))
          .join(" ");
        if (newList !== value) {
          if (changes && changes.attributes) {
            changes.attributes.push({ el, name: attr.name, value });
          }
          attr.value = newList;
        }
        continue;
      }

      if (!value.includes("#")) continue;

      let newValue = value;

      // Case A: Functional notation like url(#id), url('#id') or URL(#id)
      if (/url\s*\(/i.test(value)) {
        newValue = newValue.replace(URL_REF_RE, (match, open, _quote, id, close) => {
          return idMap.has(id) ? `${open}#${idMap.get(id)}${close}` : match;
        });
      }

      // Case B: Direct references in href or xlink:href
      if (attr.name === "href" || attr.name === "xlink:href") {
        if (value.startsWith("#")) {
          const id = value.substring(1);
          if (idMap.has(id)) {
            newValue = `#${idMap.get(id)}`;
          }
        }
      }

      if (newValue !== value) {
        // Track for restoration
        if (changes && changes.attributes) {
          changes.attributes.push({ el, name: attr.name, value });
        }
        attr.value = newValue;
      }
    }
  });

  // 3. Update references within <style> blocks to ensure CSS styling remains intact
  const styleElements = svg.querySelectorAll("style");
  styleElements.forEach((style) => {
    const css = style.textContent;
    if (!css || !css.includes("#")) return;

    // Replace #id selectors and url(#id) in CSS using the idMap
    const newCss = css.replace(CSS_ID_RE, (match, rawId, offset) => {
      const before = css.slice(0, offset);
      const insideUrl = /url\s*\(\s*['"]?\s*$/i.test(before);

      // SEC-5: hex colour detection to avoid accidental ID replacement of
      // #rgb, #rgba, #rrggbb, #rrggbbaa. Only applies in a property value
      // (a "prop:" follows the last "{", "}" or ";" before the match) and
      // never inside url(#...), which can only be an id reference.
      if (!insideUrl && /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawId)) {
        const declStart = Math.max(
          before.lastIndexOf("{"),
          before.lastIndexOf("}"),
          before.lastIndexOf(";"),
        );
        if (before.slice(declStart + 1).includes(":")) return match;
      }

      // Try the whole token first, then shorter prefixes ending before an
      // unescaped "." or ":" so "#node.label" and "#node:hover" still match.
      let candidate = rawId;
      while (candidate) {
        const id = candidate.replace(/\\(.)/g, "$1");
        if (idMap.has(id)) {
          return `#${uniqueId}-${candidate}${rawId.slice(candidate.length)}`;
        }
        const cut = candidate.search(/[.:](?=[^.:]*$)/);
        if (cut <= 0 || candidate[cut - 1] === "\\") break;
        candidate = candidate.slice(0, cut);
      }
      return match;
    });

    if (newCss !== css) {
      // Track for restoration
      if (changes && changes.styles) {
        changes.styles.set(style, css);
      }
      style.textContent = newCss;
    }
  });

  return svg;
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
    const vb = (svg.getAttribute("viewBox") || "").split(/\s+|,/).map(parseFloat);
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
