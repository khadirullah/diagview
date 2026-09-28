/**
 * DiagView Diagram Initialization
 * Enhances diagrams with interactive UI
 * @module features/diagram-init
 */

import { openFullscreen } from "../ui/modal.js";
import { exportDiagram } from "./export.js";
import { state } from "../core/config.js";
import {
  generateUniqueId,
  setSVGContent,
  getDiagramTitle,
  removeEmptyAttr,
} from "../core/utils.js";
import { resolveElementSecurity } from "../core/svg-clone.js";
import { ICONS } from "../ui/icons.js";
import { LAYOUTS, BUTTON_STYLES } from "../core/constants.js";
import { createButtonGroup } from "../ui/button-factory.js";

// Map to store per-diagram cleanup functions (for SPA-safe teardown)
const cleanupMap = new WeakMap();

// Every element initializeDiagram() has touched and not yet released, so that
// destroy() can restore all of them (including layout "off", error-boundary
// and shadow-root diagrams that have no wrapper to find them by).
const trackedElements = new Set();

// data-diagview-accent is gone, so point to its replacement once per page
let accentWarned = false;

/**
 * Check if SVG is valid and renderable
 */
function isValidSvg(svg) {
  if (!svg) return false;

  // 1. Check for browser-native XML parsing errors (malformed SVG)
  if (svg.querySelector("parsererror")) return false;

  // 2. Check if SVG has any visible structural content
  const hasContent = svg.querySelector("g, path, rect, circle, text, line, polygon, polyline");
  if (!hasContent) return false;

  // 3. Check for specific error indicators from popular libraries (like Mermaid).
  // Only match library-specific error elements — NOT the generic ".error" class which
  // can legitimately appear on diagram content nodes (e.g., an "error handling" flowchart node).
  const rootError = svg.classList?.contains("error") || svg.matches?.(".mermaid-error");
  const internalError = svg.querySelector(".error-icon, .mermaid-error");

  const errorUI = rootError ? svg : internalError;

  if (errorUI) {
    const textContent = errorUI.textContent?.toLowerCase() || "";
    const fatalKeywords = [
      "syntax error",
      "parse error",
      "error in diagram",
      "invalid",
      "[plantuml error]",
      "d2 error",
      "kroki error",
    ];

    // Reject only if the error element contains fatal keywords OR is an explicit library error class
    if (fatalKeywords.some((keyword) => textContent.includes(keyword)) || rootError) {
      return false;
    }
  }

  // 4. Check for specific library error IDs (Mermaid v10+)
  if (svg.querySelector('[id*="mermaid-"][id*="-error"]')) return false;

  // 5. Check for zero dimensions in an explicit viewBox (empty content area).
  // Only when the attribute is present: without one, viewBox.baseVal is a
  // 0x0 SVGRect in browsers, which rejected every width/height-only SVG.
  const vb = (svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb.length === 4 && (vb[2] === 0 || vb[3] === 0)) return false;

  // 6. Check for text-only error fragments (often returned by failed backend renders)
  const shapes = svg.querySelector("path, rect, circle, line, polygon, polyline");
  if (!shapes) {
    const textElements = svg.querySelectorAll("text");
    if (textElements.length > 0) {
      const allText = Array.from(textElements)
        .map((t) => t.textContent)
        .join(" ")
        .toLowerCase();
      if (allText.includes("error") || allText.includes("failed")) return false;
    }
  }

  return true;
}

/**
 * Show error boundary UI for broken diagrams
 * @returns {HTMLElement} The error UI element that was appended
 */
function showErrorBoundary(element, svg) {
  // Mark as error state
  element.dataset.diagviewError = "1";

  // Create error UI
  const errorDiv = document.createElement("div");
  errorDiv.className = "diagview-error";

  // Detect specific error type
  let errorTitle = "Diagram Error";
  let errorMessage = "This diagram could not be rendered properly.";

  if (!svg) {
    errorTitle = "No Diagram Found";
    errorMessage = "No SVG content was found in this container.";
  } else {
    const textContent = svg.textContent?.toLowerCase() || "";
    if (textContent.includes("syntax error")) {
      errorTitle = "Syntax Error";
      errorMessage = "There's a syntax error in the diagram code.";
    } else if (textContent.includes("parse error")) {
      errorTitle = "Parse Error";
      errorMessage = "The diagram code could not be parsed.";
    }
  }

  // Use DOM construction to prevent XSS from SVG text content
  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  iconSvg.classList.add("diagview-error-icon");
  iconSvg.setAttribute("viewBox", "0 0 24 24");
  iconSvg.setAttribute("fill", "none");
  iconSvg.setAttribute("stroke", "currentColor");
  iconSvg.setAttribute("stroke-width", "2");
  setSVGContent(iconSvg, '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>');

  const titleDiv = document.createElement("div");
  titleDiv.className = "diagview-error-title";
  titleDiv.textContent = errorTitle;

  const msgDiv = document.createElement("div");
  msgDiv.className = "diagview-error-message";
  msgDiv.textContent = errorMessage;

  errorDiv.appendChild(iconSvg);
  errorDiv.appendChild(titleDiv);
  errorDiv.appendChild(msgDiv);

  // Replace content or append
  if (svg) {
    svg.style.display = "none";
  }
  element.appendChild(errorDiv);

  // Fire onError callback if configured (A2: was documented but never called)
  if (state.config.onError) {
    try {
      state.config.onError(new Error(`DiagView: ${errorTitle} — ${errorMessage}`));
    } catch (e) {
      console.error("DiagView: onError callback threw:", e);
    }
  }

  return errorDiv;
}

/**
 * Extract diagram title
 */
function extractDiagramTitle(element) {
  return getDiagramTitle(element.querySelector("svg"), element).toUpperCase() || "DIAGRAM";
}

/**
 * Get button style class from config
 */
function getButtonStyleClass() {
  const configStyle = state.config.ui?.buttons?.style;
  const btnStyle = configStyle ?? BUTTON_STYLES.ACCENT;
  return `dv-btn-${btnStyle}`;
}

/**
 * Get icon with config override
 */
function getIcon(key, defaultIcon) {
  return state.config.ui?.buttons?.icons?.[key] || defaultIcon;
}

/**
 * Style class for one button. A custom icon also gets dv-custom-icon so the
 * CSS draws it as written instead of as an outline.
 */
function getButtonClass(styleClass, key) {
  return state.config.ui?.buttons?.icons?.[key] ? `${styleClass} dv-custom-icon` : styleClass;
}

/**
 * Read per-element data-diagview-* overrides and merge over global config.
 * Only layout is merged. Scale, sanitize and allow-remote are checked here
 * for warnings. Export reads scale and the data-diagview-watermark-*
 * attributes itself when it runs.
 *
 * @param {HTMLElement} element - Diagram container element
 * @returns {object} A local config snapshot for this element only
 */
function readElementOverrides(element) {
  // Start from a shallow copy of global config so we never mutate state
  const cfg = Object.assign({}, state.config);

  const { dataset } = element;

  // data-diagview-layout="header|floating|off"
  if (dataset.diagviewLayout) {
    const v = dataset.diagviewLayout.toLowerCase();
    if ([LAYOUTS.HEADER, LAYOUTS.FLOATING, LAYOUTS.OFF].includes(v)) {
      cfg.layout = v;
    } else {
      console.warn(`DiagView: Unknown data-diagview-layout "${v}" on element, ignoring.`);
    }
  }

  // data-diagview-scale="4" (integer 1–10). Export reads the attribute
  // itself, so this only warns about a bad value once, at init.
  if (dataset.diagviewScale) {
    const n = parseInt(dataset.diagviewScale, 10);
    if (isNaN(n) || n < 1 || n > 10) {
      console.warn(
        `DiagView: data-diagview-scale "${dataset.diagviewScale}" must be 1–10, ignoring.`,
      );
    }
  }

  if ("diagviewAccent" in dataset && !accentWarned) {
    accentWarned = true;
    console.warn("DiagView: data-diagview-accent was removed, use accentColor or --diagram-accent");
  }

  // data-diagview-sanitize="strict|permissive|off" and
  // data-diagview-allow-remote="true|false" are NOT merged into cfg: the
  // modal and the exporter resolve them themselves through the same gate
  // (see svg-clone.js) at the moment the SVG is cloned. The call here only
  // serves to emit the "override ignored" warnings once, at init time.
  resolveElementSecurity(element, { warn: true });

  return cfg;
}

/**
 * Initialize diagram with enhanced UI
 * @param {HTMLElement} element - Diagram container
 * @param {number} [precalculatedIndex=-1] - Optional index to avoid global DOM query
 */
export function initializeDiagram(element, precalculatedIndex = -1) {
  const svg = element?.querySelector("svg");
  if (element.dataset.diagviewInit) return;

  element.dataset.diagviewInit = "1";

  // Record everything we are about to change on the element and its SVG so
  // deinitializeDiagram() can put it all back exactly as it was.
  const record = {
    fn: null,
    wrapper: null,
    errorDiv: null,
    svg,
    prev: {
      cursor: element.style.cursor,
      display: svg ? svg.style.display : "",
      transition: svg ? svg.style.transition : "",
      color: svg ? svg.style.color : "",
      // Emptied attributes are removed on teardown unless they were here
      style: element.hasAttribute("style"),
      svgStyle: svg?.hasAttribute("style"),
      svgClass: svg?.hasAttribute("class"),
    },
  };
  cleanupMap.set(element, record);
  trackedElements.add(element);

  // Resolve config for this element: global config + any data-diagview-* overrides (A1)
  const elementConfig = readElementOverrides(element);

  // Error boundary: Check for valid SVG
  if (!svg || !isValidSvg(svg)) {
    record.errorDiv = showErrorBoundary(element, svg);
    return;
  }

  // Generate unique ID and fix SVG ID collisions
  const uniqueId = generateUniqueId();
  element.dataset.diagviewId = uniqueId;

  // MAJ-7: Cache the index to avoid expensive global DOM queries on modal open
  if (precalculatedIndex >= 0) {
    element.dataset.diagviewIndex = precalculatedIndex;
  } else {
    const allDiagrams = document.querySelectorAll(state.config.diagramSelector);
    element.dataset.diagviewIndex = Array.prototype.indexOf.call(allDiagrams, element);
  }

  // MAJ-1: We no longer mutate the original SVG's IDs to avoid "Double Prefixing"
  // and architectural fragility. IDs are now isolated only during cloning (Modal/Export).

  // Get layout configuration from element-local config
  const layout = elementConfig.layout;
  const isOff = layout === LAYOUTS.OFF;
  const isFloating = layout === LAYOUTS.FLOATING;

  // If layout is "off", just make clickable to open fullscreen
  if (isOff) {
    element.style.cursor = "pointer";
    const openHandler = () => openFullscreen(element);
    element.addEventListener("click", openHandler);

    // Store cleanup for this specific element (no wrapper in 'off' layout)
    record.fn = () => element.removeEventListener("click", openHandler);

    // Apply minimal SVG styling
    if (svg) {
      svg.style.transition = "filter 0.3s ease";
      svg.classList.add("dv-svg-content");
    }
    return;
  }

  const displayTitle = extractDiagramTitle(element);
  const styleClass = getButtonStyleClass();

  // Create wrapper structure
  const wrapper = document.createElement("div");
  wrapper.className = "diagview-wrapper";

  const viewport = document.createElement("div");
  viewport.className = "diagview-viewport";

  const controls = document.createElement("div");
  controls.className = "diagview-controls";

  // Create label (only for header layout)
  const label = document.createElement("div");
  label.className = "diagview-label";
  label.textContent = displayTitle;

  // Create buttons using button factory
  const buttons = [
    {
      action: "copy",
      title: "Copy to clipboard",
      icon: getIcon("copy", ICONS.copy),
      styleClass: getButtonClass(styleClass, "copy"),
      feedback: true,
      onClick: () => exportDiagram(element, "copy"),
    },
    {
      action: "download",
      title: "Download PNG",
      icon: getIcon("download", ICONS.dl),
      styleClass: getButtonClass(styleClass, "download"),
      feedback: true,
      onClick: () => exportDiagram(element, "download"),
    },
    {
      action: "fullscreen",
      title: "Open fullscreen",
      icon: getIcon("fullscreen", ICONS.fs),
      styleClass: getButtonClass(styleClass, "fullscreen"),
      onClick: () => openFullscreen(element),
    },
  ];

  const btnGroup = createButtonGroup(buttons);

  // Assemble controls
  if (!isFloating) {
    controls.appendChild(label);
  }
  controls.appendChild(btnGroup);

  if (isFloating) {
    controls.classList.add("diagview-controls-floating");
  }

  // Assemble structure
  element.parentNode.insertBefore(wrapper, element);

  if (isFloating) {
    // Floating: Viewport first, then controls overlay
    wrapper.appendChild(viewport);
    wrapper.appendChild(controls);
  } else {
    // Header: Controls first, then viewport
    wrapper.appendChild(controls);
    wrapper.appendChild(viewport);
  }

  viewport.appendChild(element);

  // Click viewport to open fullscreen
  const viewportHandler = (e) => {
    if (!e.target.closest(".diagview-controls")) {
      openFullscreen(element);
    }
  };
  viewport.addEventListener("click", viewportHandler);

  // Store cleanup function and wrapper reference for this specific element
  record.fn = () => viewport.removeEventListener("click", viewportHandler);
  record.wrapper = wrapper;

  // Apply SVG theme
  if (svg) {
    svg.style.transition = "filter 0.3s ease";
    svg.classList.add("dv-svg-content");
    svg.style.color = "inherit";
  }
}

/**
 * Remove diagram enhancements, returning the element (and its SVG) to the
 * exact state it was in before initializeDiagram() ran.
 */
export function deinitializeDiagram(element) {
  if (!element?.dataset.diagviewInit) return;

  // Run per-element cleanup
  const data = cleanupMap.get(element);
  if (data) {
    const { fn, wrapper, errorDiv, svg, prev } = data;

    // Always use the stored wrapper reference (bulletproof against DOM moves)
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.insertBefore(element, wrapper);
      wrapper.remove();
    }

    if (fn) fn();
    if (errorDiv) errorDiv.remove();

    if (svg) {
      svg.classList.remove("dv-svg-content");
      svg.style.display = prev.display;
      svg.style.transition = prev.transition;
      svg.style.color = prev.color;
      removeEmptyAttr(svg, "style", prev.svgStyle);
      removeEmptyAttr(svg, "class", prev.svgClass);
    }

    element.style.cursor = prev.cursor;
    removeEmptyAttr(element, "style", prev.style);

    cleanupMap.delete(element);
  }

  trackedElements.delete(element);

  delete element.dataset.diagviewInit;
  delete element.dataset.diagviewId;
  delete element.dataset.diagviewIndex;
  delete element.dataset.diagviewError;
}

/**
 * Release every diagram initializeDiagram() has touched (used by destroy()).
 */
export function deinitializeAllDiagrams() {
  Array.from(trackedElements).forEach((element) => deinitializeDiagram(element));
  trackedElements.clear();
}

/**
 * Give an error-boundary diagram another chance: if its SVG has been replaced
 * with a valid one since, drop the error UI and the init flag so the normal
 * initialization path can pick it up again.
 * @param {HTMLElement} element - Diagram container marked data-diagview-error
 * @returns {boolean} True if the element was released for re-initialization
 */
export function recoverErrorDiagram(element) {
  if (!element?.dataset.diagviewError) return false;

  // Skip the icon inside our own error UI
  const svg = Array.from(element.querySelectorAll("svg")).find(
    (candidate) => !candidate.closest(".diagview-error"),
  );
  if (!svg || !isValidSvg(svg)) return false;

  deinitializeDiagram(element);
  return true;
}
