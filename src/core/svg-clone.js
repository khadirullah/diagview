/**
 * DiagView SVG Cloning Utilities
 * Consolidated SVG cloning logic with style and text preservation
 * Replaces duplicate code from modal.js and export.js
 * @module core/svg-clone
 */

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
];

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
  originalNodes.forEach((original, i) => {
    const cloned = clonedNodes[i];
    if (!cloned) return;

    const computedStyle = window.getComputedStyle(original);

    styleProps.forEach((prop) => {
      const value = computedStyle.getPropertyValue(prop);
      // Only set if different from default to save size
      if (value && value !== "none" && value !== "normal" && value !== "auto") {
        cloned.style[prop] = value;
      }
    });
  });
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

    // Calculate textLength if missing (prevents text wrapping)
    if (!original.hasAttribute("textLength")) {
      try {
        const bbox = original.getBBox();
        if (bbox?.width > 0) {
          cloned.setAttribute("textLength", bbox.width);
          cloned.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
      } catch (e) {
        // getBBox can fail, ignore
      }
    }

    // Force nowrap to prevent text breaking
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
 * Clone SVG with optional text and style preservation
 * Unified function that replaces modal.js cloneSVGWithTextPreservation and export.js cloneSVGWithStyles
 *
 * @param {SVGElement} svg - Original SVG element to clone
 * @param {Object} options - Cloning options
 * @param {boolean} options.preserveText - Preserve text attributes and dimensions (default: true)
 * @param {boolean} options.preserveStyles - Copy computed styles to inline (default: false)
 * @param {Array<string>} options.styleProps - Style properties to copy (default: DEFAULT_STYLE_PROPS)
 * @param {boolean} options.preserveStyleElements - Copy <style> tags (default: true)
 * @returns {SVGElement} Cloned SVG element
 *
 * @example
 * // For modal display (text preservation only)
 * const clone = cloneSVG(svg, { preserveText: true, preserveStyles: false });
 *
 * // For export (full style baking)
 * const clone = cloneSVG(svg, { preserveText: true, preserveStyles: true });
 *
 * // Custom style properties
 * const clone = cloneSVG(svg, {
 *   preserveStyles: true,
 *   styleProps: ['fill', 'stroke', 'opacity']
 * });
 */
export function cloneSVG(svg, options = {}) {
  const {
    preserveText = true,
    preserveStyles = false,
    styleProps = DEFAULT_STYLE_PROPS,
    preserveStyleElements = true,
  } = options;

  if (!svg) {
    console.warn("DiagView: No SVG provided to cloneSVG");
    return null;
  }

  // Create deep clone
  const clone = svg.cloneNode(true);

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
  if (preserveStyles) {
    const originalNodes = svg.querySelectorAll("*");
    const clonedNodes = clone.querySelectorAll("*");
    copyComputedStyles(originalNodes, clonedNodes, styleProps);
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
  return cloneSVG(svg, {
    preserveText: true,
    preserveStyles: false,
    preserveStyleElements: true,
  });
}

/**
 * Clone SVG specifically for export
 * Bakes all computed styles for standalone use
 *
 * @param {SVGElement} svg - Original SVG element
 * @returns {SVGElement} Cloned SVG
 */
export function cloneSVGForExport(svg) {
  return cloneSVG(svg, {
    preserveText: true,
    preserveStyles: true,
    preserveStyleElements: true,
  });
}

/**
 * Clone SVG with custom style properties
 * Useful for selective style baking
 *
 * @param {SVGElement} svg - Original SVG element
 * @param {Array<string>} customProps - Custom style properties to preserve
 * @returns {SVGElement} Cloned SVG
 */
export function cloneSVGWithCustomStyles(svg, customProps) {
  return cloneSVG(svg, {
    preserveText: true,
    preserveStyles: true,
    styleProps: customProps,
  });
}
