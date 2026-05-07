/**
 * DiagView Diagram Initialization
 * Enhances diagrams with interactive UI
 * @module features/diagram-init
 */

import { openFullscreen } from "../ui/modal.js";
import { exportDiagram } from "./export.js";
import { state } from "../core/config.js";
import { generateUniqueId, setSVGContent } from "../core/utils.js";
import { ICONS } from "../ui/icons.js";
import { LAYOUTS, BUTTON_STYLES } from "../core/constants.js";
import { createButtonGroup } from "../ui/button-factory.js";

// Map to store per-diagram cleanup functions (for SPA-safe teardown)
const cleanupMap = new WeakMap();

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

  // 5. Check for zero dimensions in viewBox (empty content area)
  const vb = svg.viewBox?.baseVal;
  if (vb && (vb.width === 0 || vb.height === 0)) return false;

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
}

/**
 * Extract diagram title
 */
function extractDiagramTitle(element) {
  // Try to find title in data attribute
  const dataTitle = element.getAttribute("data-title");
  if (dataTitle) return dataTitle.toUpperCase();

  // Try to find title in SVG
  const svg = element.querySelector("svg");
  if (svg) {
    const titleEl = svg.querySelector("title");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim().toUpperCase();
    }
  }

  return "DIAGRAM";
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
 * Read per-element data-diagview-* overrides and merge over global config.
 * Supports: data-diagview-layout, data-diagview-accent, data-diagview-scale
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

  // data-diagview-accent="#ff6b6b" (any valid CSS color string)
  if (dataset.diagviewAccent) {
    cfg.accentColor = dataset.diagviewAccent;
  }

  // data-diagview-scale="4" (integer 1–10)
  if (dataset.diagviewScale) {
    const n = parseInt(dataset.diagviewScale, 10);
    if (!isNaN(n) && n >= 1 && n <= 10) {
      cfg.highResScale = n;
    } else {
      console.warn(
        `DiagView: data-diagview-scale "${dataset.diagviewScale}" must be 1–10, ignoring.`,
      );
    }
  }

  // data-diagview-sanitize="strict|permissive|off"
  // Only respected if the global config has allowOverrides: true (default).
  // Use "off" only for diagrams from a fully trusted, controlled source.
  if (dataset.diagviewSanitize && state.config.security?.allowOverrides) {
    const v = dataset.diagviewSanitize.toLowerCase();
    if (["strict", "permissive", "off"].includes(v)) {
      if (v === "off") {
        console.warn(
          `DiagView: SVG sanitization disabled on element via data-diagview-sanitize="off". Ensure the SVG source is trusted.`,
        );
      }
      // Shallow-merge so other security properties (allowOverrides) are preserved
      cfg.security = { ...state.config.security, mode: v };
    } else {
      console.warn(
        `DiagView: Unknown data-diagview-sanitize value "${dataset.diagviewSanitize}". Must be "strict", "permissive", or "off". Ignoring.`,
      );
    }
  }

  // data-diagview-allow-remote="true|false"
  // Allows external CSS/@import/remote URLs for this diagram only.
  if (dataset.diagviewAllowRemote && state.config.security?.allowOverrides) {
    const v = dataset.diagviewAllowRemote.toLowerCase() === "true";
    cfg.security = { ...cfg.security, allowRemoteResources: v };
  }

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

  // Resolve config for this element: global config + any data-diagview-* overrides (A1)
  const elementConfig = readElementOverrides(element);

  // If a per-element accent is set, apply it as a CSS custom property on the element
  // so buttons and highlights use it without affecting other diagrams
  if (element.dataset.diagviewAccent) {
    element.style.setProperty("--dv-accent", elementConfig.accentColor);
  }

  // Error boundary: Check for valid SVG
  if (!svg || !isValidSvg(svg)) {
    showErrorBoundary(element, svg);
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
  const fixedSvg = svg;

  // Get layout configuration from element-local config
  const layout = elementConfig.layout;
  const isOff = layout === LAYOUTS.OFF;
  const isFloating = layout === LAYOUTS.FLOATING;

  // If layout is "off", just make clickable to open fullscreen
  if (isOff) {
    element.style.cursor = "pointer";
    const openHandler = () => openFullscreen(element);
    element.addEventListener("click", openHandler);

    // Store cleanup for this specific element
    cleanupMap.set(element, {
      fn: () => element.removeEventListener("click", openHandler),
      wrapper: null, // No wrapper used in 'off' layout
    });

    // Apply minimal SVG styling
    if (fixedSvg) {
      fixedSvg.style.transition = "filter 0.3s ease";
      fixedSvg.classList.add("dv-svg-content");
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
      styleClass: styleClass,
      feedback: true,
      onClick: () => exportDiagram(element, "copy"),
    },
    {
      action: "download",
      title: "Download PNG",
      icon: getIcon("download", ICONS.dl),
      styleClass: styleClass,
      feedback: true,
      onClick: () => exportDiagram(element, "download"),
    },
    {
      action: "fullscreen",
      title: "Open fullscreen",
      icon: getIcon("fullscreen", ICONS.fs),
      styleClass: styleClass,
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
  cleanupMap.set(element, {
    fn: () => viewport.removeEventListener("click", viewportHandler),
    wrapper: wrapper,
  });

  // Apply SVG theme
  if (fixedSvg) {
    fixedSvg.style.transition = "filter 0.3s ease";
    fixedSvg.classList.add("dv-svg-content");
    fixedSvg.style.color = "inherit";
  }
}

/**
 * Remove diagram enhancements
 */
export function deinitializeDiagram(element) {
  if (!element?.dataset.diagviewInit) return;

  // Run per-element cleanup
  const data = cleanupMap.get(element);
  if (data) {
    const { fn, wrapper } = data;

    // Always use the stored wrapper reference (bulletproof against DOM moves)
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.insertBefore(element, wrapper);
      wrapper.remove();
    }

    if (fn) fn();
    cleanupMap.delete(element);
  }

  delete element.dataset.diagviewInit;
  delete element.dataset.diagviewId;
}
