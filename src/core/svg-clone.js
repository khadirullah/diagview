import { state } from "./config.js";
import { sanitizeSVG, fixIds, generateUniqueId, inertDocument } from "./utils.js";
import { showErrorToast, showInfoToast } from "../ui/toast.js";
import { SECURITY_MODES } from "./constants.js";

/**
 * CSS style properties to preserve when cloning
 */
const DEFAULT_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "word-spacing",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "visibility",
  "clip-path",
  "filter",
  "mask",
  "stop-color",
  "stop-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "marker-start",
  "marker-mid",
  "marker-end",
  "vector-effect",
];

/**
 * Maximum number of nodes whose computed styles are captured for export.
 * A node count, deliberately decoupled from performance.largeFileThreshold
 * (which is measured in characters); keeps the previous effective cap so
 * large diagrams still export fully styled. The sync path has its own cap.
 * @private
 */
const MAX_EXPORT_STYLED_NODES = 1_000_000;

// ─── NEW HELPER ──────────────────────────────────────────────────────────────
/**
 * Browsers return absolute URLs for url(#id) refs in getComputedStyle.
 * Those absolute URLs break when SVG is serialised as a data-URL for canvas
 * rendering, because the browser cannot resolve cross-origin or opaque-origin
 * absolute hrefs from within a data-URL context.
 *
 * Converts:  url("http://host/page#marker-1")  →  url(#marker-1)
 *            url('#clip-0')                    →  url(#clip-0)   (no-op)
 *
 * @param {string} value - CSS property value
 * @returns {string} Value with absolute url() refs normalised to fragments
 */
function normalizeUrlInStyle(value) {
  if (!value || !value.includes("url(")) return value;
  return value.replace(/url\(['"]?[^'"#)]*#([^'"#)\s]+)['"]?\)/g, "url(#$1)");
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SVG/Text attributes to preserve
 */
const TEXT_ATTRIBUTES = [
  "x",
  "y",
  "dx",
  "dy",
  "textLength",
  "lengthAdjust",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "rotate",
  "transform",
];

/**
 * Copy computed styles from original elements to cloned elements
 * @private
 */
function copyComputedStyles(originalNodes, clonedNodes, styleProps) {
  const len = originalNodes.length;
  const propLen = styleProps.length;

  // PERF-1: Safety cap for extremely large diagrams to prevent main thread lockup.
  const MAX_STYLED_NODES = 5000;
  const nodeCount = Math.min(len, MAX_STYLED_NODES);

  if (len > MAX_STYLED_NODES) {
    console.warn(`DiagView: Styling ${MAX_STYLED_NODES}/${len} nodes (Performance Cap)`);
  }

  const cache = new Map();
  const computedData = new Array(nodeCount);

  // PHASE 1: BATCHED READS
  for (let i = 0; i < nodeCount; i++) {
    const original = originalNodes[i];
    if (!original) continue;

    const tag = original.tagName?.toLowerCase();
    if (tag === "defs" || tag === "metadata") continue;

    const inlineStyle = original.getAttribute("style") || "";
    const className = original.className?.baseVal || original.className || "";
    if (tag === "g" && !className && !inlineStyle) continue;

    // MAJ-2: Improve cache key to include parent styling context (tag + class + style)
    // to prevent "Style Bleeding" from inherited properties.
    const parent = original.parentNode;
    const parentInfo =
      parent && parent.getAttribute
        ? `${parent.tagName}\x1F${parent.className?.baseVal || ""}\x1F${parent.getAttribute("style") || ""}`
        : "";

    // Only cache if the element has explicit styling (class or inline style).
    // Plain elements rely too heavily on deep inheritance to be safely cached by parent context alone.
    const canCache = (className || inlineStyle) && parent;
    const cacheKey = canCache ? `${tag}\x1F${className}\x1F${inlineStyle}\x1F${parentInfo}` : null;

    let stylesToApply = cacheKey ? cache.get(cacheKey) : undefined;

    if (stylesToApply === undefined) {
      stylesToApply = {};
      const computedStyle = window.getComputedStyle(original);

      for (let j = 0; j < propLen; j++) {
        const prop = styleProps[j];
        // ── FIX: normalise absolute url() refs returned by getComputedStyle ──
        const value = normalizeUrlInStyle(computedStyle.getPropertyValue(prop));

        if (value) {
          if (value === "normal" || value === "auto" || value === "0px") continue;
          // Do NOT filter "none" — explicit fill:none must be preserved
          stylesToApply[prop] = value;
        }
      }

      if (cacheKey) {
        cache.set(cacheKey, stylesToApply);
      }
    }
    computedData[i] = stylesToApply;
  }

  // PHASE 2: BATCHED WRITES
  // Now we apply all cached styles without performing any new reads.
  for (let i = 0; i < nodeCount; i++) {
    const cloned = clonedNodes[i];
    const stylesToApply = computedData[i];

    if (cloned && stylesToApply) {
      for (const prop in stylesToApply) {
        cloned.style[prop] = stylesToApply[prop];
      }
    }
  }
}

/**
 * Copy text attributes and calculate textLength for preservation
 * @private
 */
function preserveTextAttributes(originalTexts, clonedTexts) {
  originalTexts.forEach((original, i) => {
    const cloned = clonedTexts[i];
    if (!cloned) return;

    // Copy all text-specific attributes
    TEXT_ATTRIBUTES.forEach((attr) => {
      if (original.hasAttribute(attr)) {
        cloned.setAttribute(attr, original.getAttribute(attr));
      }
    });

    // OPT-1: Avoid getBBox() in loops as it triggers layout thrashing.
    // Instead of forcing textLength, we rely on white-space: nowrap and
    // overflow: visible to ensure text labels remain intact during modal transitions.
    cloned.style.whiteSpace = "nowrap";
    cloned.style.overflow = "visible";
  });
}

/**
 * Copy style elements from original to clone
 * @private
 */
function copyStyleElements(originalSvg, clonedSvg) {
  const originalStyles = originalSvg.querySelectorAll("style");
  const clonedStyles = clonedSvg.querySelectorAll("style");

  originalStyles.forEach((original, i) => {
    if (clonedStyles[i]) {
      clonedStyles[i].textContent = original.textContent;
    }
  });
}

/** Diagrams already warned about, so each one warns once per page load */
const warnedCode = new WeakSet();

/**
 * Tell the page author once when the sanitizer removed code from a diagram.
 * @param {Element} svg - The page SVG
 * @param {string} mode - Security mode used
 * @param {import("./utils.js").RemovedCode} removed - What the sanitizer removed
 * @private
 */
function warnRemovedCode(svg, mode, { scripts, handlers, urls }) {
  const list = [];
  const add = (n, what, names = "") => n && list.push(`${n} ${what}${n > 1 ? "s" : ""}${names}`);
  add(scripts, "script");
  add(handlers.length, "event handler", ` (${[...new Set(handlers)].join(", ")})`);
  add(urls, "javascript: link");
  const diagram = svg.closest("[data-diagview-index]") || svg;
  if (!list.length || warnedCode.has(diagram)) return;
  warnedCode.add(diagram);
  // The element goes along so the console can point at it on the page
  console.warn(
    `DiagView: Removed code from this diagram in ${mode} mode: ${list.join(", ")}. Use security.mode "off" only for diagrams you trust.`,
    diagram,
  );
}

/**
 * Rewrite IDs in a cloned SVG to prevent collisions on multi-diagram pages.
 * @private
 */
/**
 * Clone SVG with optional text and style preservation
 * Unified function that replaces modal.js cloneSVGWithTextPreservation and export.js cloneSVGWithStyles
 *
 * @param {SVGElement} svg - Original SVG element to clone
 * @param {object} options - Cloning options
 * @param {boolean} options.preserveText - Preserve text attributes and dimensions (default: true)
 * @param {boolean} options.preserveStyles - Copy computed styles to inline (default: false)
 * @param {Array<string>} options.styleProps - Style properties to copy (default: DEFAULT_STYLE_PROPS)
 * @param {boolean} options.preserveStyleElements - Copy <style> tags (default: true)
 * @param {'strict'|'permissive'|'off'} options.securityMode - SVG sanitization mode (default: 'strict')
 * @param {number} options.maxChars - Hard size limit in serialized chars (default: performance.criticalFileLimit)
 * @returns {SVGElement|null} Cloned SVG element, or null when blocked by the size limit
 */
export function cloneSVG(svg, options = {}) {
  // Security & Performance: Get thresholds from config
  const { performance = {} } = state.config;
  const largeFileThreshold = performance.largeFileThreshold || 1000000;
  const criticalFileLimit = performance.criticalFileLimit || 50000000;

  const {
    preserveText = true,
    preserveStyles = false,
    styleProps = DEFAULT_STYLE_PROPS,
    preserveStyleElements = true,
    securityMode = "strict",
    skipIdFix = false,
    allowRemoteResources = state.config.security.allowRemoteResources,
    maxChars = criticalFileLimit,
  } = options;

  if (!svg) {
    console.warn("DiagView: No SVG provided to cloneSVG");
    return null;
  }

  // Copy into a document with no window. A copy made in the page starts
  // loading its images at once, so an onerror handler would run before the
  // sanitizer removes it.
  const rawClone = inertDocument().importNode(svg, true);

  // Performance Bypass: If SVG is very large, skip the expensive computed style loop
  let effectivePreserveStyles = preserveStyles;
  const svgSize = svg.innerHTML?.length || 0;

  if (preserveStyles && svgSize > largeFileThreshold) {
    effectivePreserveStyles = false;
    showInfoToast("Large diagram: Performance optimizations applied");
  }

  // All original<->clone operations pair nodes POSITIONALLY, so they must run
  // on the raw clone, whose node list matches the original 1:1 by
  // construction. Running them after sanitization (which can remove nodes)
  // shifts every subsequent pair, copying styles and text attributes onto the
  // wrong elements — and, worse, re-injecting <style> content the sanitizer
  // removed. Sanitizing LAST also means inlined computed styles get scrubbed.

  // Copy style elements
  if (preserveStyleElements) {
    copyStyleElements(svg, rawClone);
  }

  // Preserve text attributes and dimensions
  if (preserveText) {
    const originalTexts = svg.querySelectorAll("text, tspan");
    const clonedTexts = rawClone.querySelectorAll("text, tspan");
    preserveTextAttributes(originalTexts, clonedTexts);
  }

  // Copy computed styles to inline styles (for exports)
  if (effectivePreserveStyles) {
    const originalNodes = svg.querySelectorAll("*");
    const clonedNodes = rawClone.querySelectorAll("*");
    copyComputedStyles(originalNodes, clonedNodes, styleProps);
  }

  // Sanitize to prevent XSS — always the FINAL content transformation.
  // securityMode is passed from the diagram's elementConfig so that
  // per-element data-diagview-sanitize overrides reach the sanitizer.
  const removed = { scripts: 0, handlers: [], urls: 0 };
  const clone = sanitizeSVG(rawClone, securityMode, {
    maxChars,
    allowRemoteResources: allowRemoteResources,
    allowedImageTypes: state.config.allowedImageTypes,
    removed,
  });
  warnRemovedCode(svg, securityMode, removed);

  if (!clone) {
    showErrorToast("Diagram blocked", "File size exceeds security limits");
    return null;
  }

  // Ensure standard namespaces for external compatibility
  if (clone instanceof SVGElement) {
    if (!clone.hasAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    if (!clone.hasAttribute("xmlns:xlink")) {
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    }
  }

  // Final Step: Isolate IDs to prevent collisions (always done for safety unless skipped)
  if (!skipIdFix) {
    fixIds(clone, generateUniqueId());
  }

  return clone;
}

/** Unknown data-diagview-sanitize values already warned about */
const warnedModes = new Set();

/**
 * Resolve the effective security settings for one diagram container.
 *
 * Per-element `data-diagview-sanitize` / `data-diagview-allow-remote`
 * attributes are honoured ONLY when `security.allowOverrides` is true, and
 * only with a recognised value. Anything else falls back to the global config.
 * This is the single gate for both init-time and modal-time resolution so the
 * modal can never be more permissive than the documented rules allow.
 *
 * @param {Element|null|undefined} container - Diagram container (may be null)
 * @param {{ warn?: boolean }} [options] - warn: emit console warnings for
 *   "off" and for unrecognised values (init-time only, to avoid log spam)
 * @returns {{ mode: string, allowRemoteResources: boolean, allowOverrides: boolean }} Effective security settings
 */
export function resolveElementSecurity(container, options = {}) {
  const global = state.config.security || {};
  const resolved = {
    mode: SECURITY_MODES.includes(global.mode) ? global.mode : "strict",
    allowRemoteResources: global.allowRemoteResources === true,
    allowOverrides: global.allowOverrides === true,
  };

  if (!resolved.allowOverrides) return resolved;
  const dataset = container?.dataset;
  if (!dataset) return resolved;

  if (dataset.diagviewSanitize) {
    const v = String(dataset.diagviewSanitize).toLowerCase();
    if (SECURITY_MODES.includes(v)) {
      resolved.mode = v;
      if (v === "off" && options.warn) {
        console.warn(
          `DiagView: SVG sanitization disabled on element via data-diagview-sanitize="off". Ensure the SVG source is trusted.`,
        );
      }
    } else if (options.warn && warnedModes.size < warnedModes.add(v).size) {
      console.warn(
        `DiagView: Unknown data-diagview-sanitize "${dataset.diagviewSanitize}", using "${resolved.mode}"`,
      );
    }
  }

  if (dataset.diagviewAllowRemote) {
    resolved.allowRemoteResources = String(dataset.diagviewAllowRemote).toLowerCase() === "true";
  }

  return resolved;
}

/**
 * Clone SVG specifically for modal display
 * Optimized preset for interactive viewing
 *
 * @param {SVGElement} svg - Original SVG element
 * @returns {SVGElement} Cloned SVG
 */
export function cloneSVGForModal(svg) {
  // NOTE: MAJ-1 - Isolation happens here. Since we no longer prefix IDs in
  // diagram-init.js, a single prefix pass here (via skipIdFix: false) ensures
  // the modal is isolated from both the host page and other diagrams
  // without "Double Prefixing".

  // Security: per-element override > global config, gated by allowOverrides.
  const container = svg.closest(state.config.diagramSelector || ".diagram, .mermaid, .chart");
  const security = resolveElementSecurity(container);

  return cloneSVG(svg, {
    preserveText: true,
    preserveStyles: false,
    preserveStyleElements: true,
    securityMode: security.mode,
    skipIdFix: false, // SVG-1: Isolate IDs even for modal to prevent cross-diagram filter breakage
    allowRemoteResources: security.allowRemoteResources,
  });
}

/**
 * Clone SVG specifically for export
 * Bakes all computed styles for standalone use
 *
 * @param {SVGElement} svg - Original SVG element
 * @returns {SVGElement} Cloned SVG
 */
/**
 * Clone SVG specifically for export (Asynchronous)
 * Bakes all computed styles for standalone use without locking the main thread.
 */
/**
 * Clone SVG for export — async-friendly but with synchronous style capture.
 *
 * KEY CHANGES vs original:
 *  1. Computed styles are captured SYNCHRONOUSLY before any async frame splits.
 *     This prevents race conditions where DOM changes (modal close, scroll)
 *     corrupt styles in later RAF chunks.
 *  2. Caching is removed — each element gets fresh styles (fixes pie chart
 *     fill loss caused by cache key collision on same-class sibling elements).
 *  3. Async chunking is applied only to the WRITE phase (applying styles to clone),
 *     which is safe to defer as the data is already captured.
 *
 * @param {SVGElement} svg - ORIGINAL page SVG (not modal clone)
 * @returns {Promise<SVGElement>} The cloned SVG element
 */
export function cloneSVGForExportAsync(svg) {
  return new Promise((resolve) => {
    const originalNodes = Array.from(svg.querySelectorAll("*"));
    // Safety cap on the number of nodes whose computed styles are read.
    // This is a node count, distinct from performance.largeFileThreshold
    // (which is measured in characters).
    const nodeCount = Math.min(originalNodes.length, MAX_EXPORT_STYLED_NODES);
    if (originalNodes.length > MAX_EXPORT_STYLED_NODES) {
      console.warn(
        `DiagView: Styling ${MAX_EXPORT_STYLED_NODES}/${originalNodes.length} nodes for export (Performance Cap)`,
      );
    }

    // ─── PHASE 1: Synchronous style READ ──────────────────────────────────
    // Must happen before cloning and before any async work.
    // Reading after RAF frames risks getting wrong computed values if DOM changes.
    const capturedStyles = new Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      const node = originalNodes[i];
      node.setAttribute("data-dv-match-id", String(i));

      const tag = node.tagName?.toLowerCase();
      if (tag === "defs" || tag === "metadata" || tag === "style" || tag === "title") {
        capturedStyles[i] = null;
        continue;
      }

      // Skip plain <g> containers with no class or inline style — unlikely to
      // have meaningful fills/strokes that differ from default.
      const inlineStyle = node.getAttribute("style") || "";
      const className = (node.className?.baseVal ?? node.getAttribute?.("class")) || "";
      if (tag === "g" && !className && !inlineStyle) {
        capturedStyles[i] = null;
        continue;
      }

      const styles = {};
      try {
        const cs = window.getComputedStyle(node);
        for (const prop of DEFAULT_STYLE_PROPS) {
          const val = normalizeUrlInStyle(cs.getPropertyValue(prop));
          // Filter defaults but keep "none" for explicit fills
          if (!val) continue;
          if (val === "normal" || val === "auto" || val === "0px") continue;
          // Keep "none" for fills if explicitly set (prevents white → transparent)
          styles[prop] = val;
        }
      } catch {
        // SVG not in layout — skip
      }
      capturedStyles[i] = Object.keys(styles).length ? styles : null;
    }

    // ─── PHASE 2: Clone ──────────────────────────────────────────────────
    // cloneSVG applies performance.criticalFileLimit as its size guard.
    // Security: per-element override > global config, gated by allowOverrides
    // (same resolution as the modal preset so both paths sanitize alike).
    const container = svg.closest?.(state.config.diagramSelector || ".diagram, .mermaid, .chart");
    const security = resolveElementSecurity(container);
    const clone = cloneSVG(svg, {
      preserveText: true,
      preserveStyles: false,
      preserveStyleElements: true,
      securityMode: security.mode,
      allowRemoteResources: security.allowRemoteResources,
      skipIdFix: true,
    });

    // Remove match-ids from ORIGINAL immediately (before any awaits)
    for (let i = 0; i < nodeCount; i++) {
      originalNodes[i].removeAttribute("data-dv-match-id");
    }

    if (!clone) {
      resolve(null);
      return;
    }

    // ─── PHASE 3: Async WRITE (apply captured styles to clone) ──────────
    // Safe to defer: data is already in capturedStyles[], not read from DOM.
    const clonedNodes = Array.from(clone.querySelectorAll("[data-dv-match-id]"));
    const WRITE_CHUNK = 500;
    let wi = 0;

    function applyChunk() {
      const end = Math.min(wi + WRITE_CHUNK, clonedNodes.length);
      for (; wi < end; wi++) {
        const cloned = clonedNodes[wi];
        const idx = parseInt(cloned.getAttribute("data-dv-match-id"), 10);
        const styles = idx >= 0 && idx < capturedStyles.length ? capturedStyles[idx] : null;
        if (styles) {
          for (const prop in styles) {
            cloned.style[prop] = styles[prop];
          }
        }
        cloned.removeAttribute("data-dv-match-id");
      }
      if (wi < clonedNodes.length) {
        requestAnimationFrame(applyChunk);
      } else {
        resolve(clone);
      }
    }

    requestAnimationFrame(applyChunk);
  });
}
