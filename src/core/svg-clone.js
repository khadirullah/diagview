import { state } from "./config.js";
import { sanitizeSVG, fixIds, generateUniqueId } from "./utils.js";
import { showErrorToast, showInfoToast } from "../ui/toast.js";

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
 * @returns {SVGElement} Cloned SVG element
 */
export function cloneSVG(svg, options = {}) {
  const {
    preserveText = true,
    preserveStyles = false,
    styleProps = DEFAULT_STYLE_PROPS,
    preserveStyleElements = true,
    securityMode = "strict",
    skipIdFix = false,
    allowRemoteResources = state.config.security.allowRemoteResources,
  } = options;

  if (!svg) {
    console.warn("DiagView: No SVG provided to cloneSVG");
    return null;
  }

  // Security & Performance: Get thresholds from config
  const { performance = {} } = state.config;
  const largeFileThreshold = performance.largeFileThreshold || 1000000;
  const criticalFileLimit = performance.criticalFileLimit || 50000000;

  // Create deep clone and sanitize to prevent XSS.
  // securityMode is passed from the diagram's elementConfig so that
  // per-element data-diagview-sanitize overrides reach the sanitizer.
  const rawClone = svg.cloneNode(true);
  const clone = sanitizeSVG(rawClone, securityMode, {
    maxChars: criticalFileLimit,
    allowRemoteResources: allowRemoteResources,
    allowedImageTypes: state.config.allowedImageTypes,
  });

  if (!clone) {
    showErrorToast("Diagram blocked", "File size exceeds security limits");
    return null;
  }

  // Performance Bypass: If SVG is very large, skip the expensive computed style loop
  let effectivePreserveStyles = preserveStyles;
  const svgSize = svg.innerHTML?.length || 0;

  if (preserveStyles && svgSize > largeFileThreshold) {
    effectivePreserveStyles = false;
    showInfoToast("Large diagram: Performance optimizations applied");
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

  // Copy style elements
  if (preserveStyleElements) {
    copyStyleElements(svg, clone);
  }

  // Preserve text attributes and dimensions
  if (preserveText) {
    const originalTexts = svg.querySelectorAll("text, tspan");
    const clonedTexts = clone.querySelectorAll("text, tspan");
    preserveTextAttributes(originalTexts, clonedTexts);
  }

  // Copy computed styles to inline styles (for exports)
  if (effectivePreserveStyles) {
    const originalNodes = svg.querySelectorAll("*");
    const clonedNodes = clone.querySelectorAll("*");
    copyComputedStyles(originalNodes, clonedNodes, styleProps);
  }

  // Final Step: Isolate IDs to prevent collisions (always done for safety unless skipped)
  if (!skipIdFix) {
    fixIds(clone, generateUniqueId());
  }

  return clone;
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

  // Determine security mode (per-element override > global config)
  const container = svg.closest(state.config.diagramSelector || ".diagram, .mermaid, .chart");
  const localMode = container?.dataset?.diagviewSanitize;
  const securityMode = localMode || state.config.security.mode || "strict";

  const allowRemote =
    container?.dataset?.diagviewAllowRemote === "true" ||
    state.config.security.allowRemoteResources;

  return cloneSVG(svg, {
    preserveText: true,
    preserveStyles: false,
    preserveStyleElements: true,
    securityMode: securityMode,
    skipIdFix: false, // SVG-1: Isolate IDs even for modal to prevent cross-diagram filter breakage
    allowRemoteResources: allowRemote,
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
    const limit = state.config.performance?.largeFileThreshold || 10000;
    const nodeCount = Math.min(originalNodes.length, limit); // Safety cap

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
    const { performance: perfCfg = {} } = state.config;
    const criticalFileLimit = perfCfg.criticalFileLimit || 50_000_000;

    const clone = cloneSVG(svg, {
      preserveText: true,
      preserveStyles: false,
      preserveStyleElements: true,
      securityMode: state.config.security?.mode || "strict",
      skipIdFix: true,
      maxChars: criticalFileLimit,
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
