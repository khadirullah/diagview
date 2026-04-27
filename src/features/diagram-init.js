/**
 * DiagView Diagram Initialization
 * Enhances diagrams with interactive UI
 * @module features/diagram-init
 */

import { openFullscreen } from "../ui/modal.js";
import { exportDiagram } from "./export.js";
import { state } from "../core/config.js";
import { fixIds, generateUniqueId, setSVGContent } from "../core/utils.js";
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

  // 3. Check for specific error indicators from popular libraries (like Mermaid)
  // We check for elements that are explicitly designed to show errors
  const rootError = svg.classList?.contains("error") || (svg.matches && svg.matches(".mermaid-error"));
  const internalError = svg.querySelector(".error-icon, .mermaid-error, #error-boundary, .error");

  const errorUI = rootError ? svg : internalError;

  if (errorUI) {
    const textContent = errorUI.textContent?.toLowerCase() || "";
    const fatalKeywords = ["syntax error", "parse error", "error in diagram", "invalid"];
    
    // We only reject if we find fatal keywords OR if it's an explicit library error class
    if (fatalKeywords.some((keyword) => textContent.includes(keyword)) || rootError) {
      return false;
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
 * Initialize diagram with enhanced UI
 */
export function initializeDiagram(element) {
  const svg = element?.querySelector("svg");
  if (element.dataset.diagviewInit) return;

  element.dataset.diagviewInit = "1";

  // Error boundary: Check for valid SVG
  if (!svg || !isValidSvg(svg)) {
    showErrorBoundary(element, svg);
    return;
  }

  // Generate unique ID and fix SVG ID collisions
  const uniqueId = generateUniqueId();
  element.dataset.diagviewId = uniqueId;

  // Backup original IDs before mutation for seamless restoration
  const originalIds = new Map();
  svg.querySelectorAll("[id]").forEach((el) => {
    originalIds.set(el, el.id);
  });

  // Fix ID collisions for multi-diagram pages
  const fixedSvg = fixIds(svg, uniqueId);

  // Get layout configuration
  const layout = state.config.layout;
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
      originalIds: originalIds, // Store for restoration
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
    originalIds: originalIds, // Store for restoration
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
    const { fn, wrapper, originalIds } = data;

    // Restore original IDs to host SVG
    if (originalIds) {
      originalIds.forEach((oldId, el) => {
        try {
          if (el && document.contains(el)) {
            el.id = oldId;
          }
        } catch (e) { /* ignore */ }
      });
    }

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
