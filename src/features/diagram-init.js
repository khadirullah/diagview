/**
 * DiagView Diagram Initialization
 * Enhances diagrams with interactive UI
 * @module features/diagram-init
 */

import { openFullscreen } from "../ui/modal.js";
import { exportDiagram } from "./export.js";
import { state } from "../core/config.js";
import { fixIds, generateUniqueId } from "../core/utils.js";
import { ICONS } from "../ui/icons.js";
import { LAYOUTS, BUTTON_STYLES } from "../core/constants.js";
import { createButton, createButtonGroup } from "../ui/button-factory.js";

/**
 * Check if SVG is valid and renderable
 */
function isValidSvg(svg) {
  if (!svg) return false;

  // Check if SVG has any visible content
  const hasContent = svg.querySelector("g, path, rect, circle, text, line, polygon, polyline");
  if (!hasContent) return false;

  // Check for Mermaid error class
  if (svg.classList.contains("error") || svg.querySelector(".error")) {
    return false;
  }

  // Check for common error indicators in text
  const textContent = svg.textContent?.toLowerCase() || "";
  const errorKeywords = ["syntax error", "parse error", "invalid", "error in diagram"];
  if (errorKeywords.some(keyword => textContent.includes(keyword))) {
    return false;
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

  errorDiv.innerHTML = `
    <svg class="diagview-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4M12 16h.01"/>
    </svg>
    <div class="diagview-error-title">${errorTitle}</div>
    <div class="diagview-error-message">${errorMessage}</div>
  `;

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
    const titleEl = svg.querySelector("title, text[class*='title']");
    if (titleEl) return titleEl.textContent.trim().toUpperCase();
  }

  // Try to find title in content
  const content = element.textContent || "";
  const titleMatch = content.match(/title[:\s]+([^\n\r]+)/i);
  if (titleMatch) return titleMatch[1].trim().toUpperCase();

  return "DIAGRAM";
}

/**
 * Get button style class from config
 */
function getButtonStyleClass() {
  const configStyle = state.config.ui?.buttons?.style;
  const btnStyle = configStyle || BUTTON_STYLES.ACCENT;
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

  // Fix ID collisions for multi-diagram pages
  const fixedSvg = fixIds(svg, uniqueId);

  // Get layout configuration
  const layout = state.config.layout;
  const isOff = layout === LAYOUTS.OFF;
  const isFloating = layout === LAYOUTS.FLOATING;

  // If layout is "off", just make clickable to open fullscreen
  if (isOff) {
    element.style.cursor = "pointer";
    element.addEventListener("click", () => openFullscreen(element));

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
  viewport.addEventListener("click", (e) => {
    if (!e.target.closest(".diagview-controls")) {
      openFullscreen(element);
    }
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

  const wrapper = element.closest(".diagview-wrapper");
  if (wrapper) {
    wrapper.parentNode.insertBefore(element, wrapper);
    wrapper.remove();
  }

  delete element.dataset.diagviewInit;
  delete element.dataset.diagviewId;
}
