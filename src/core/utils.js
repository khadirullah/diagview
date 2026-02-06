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

/**
 * Detect if device is mobile/touch-capable
 */
export function isMobileDevice() {
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.matchMedia?.("(max-width: 768px)").matches
  );
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if clipboard API is available
 */
export function isClipboardAvailable() {
  return (
    isBrowser() &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function"
  );
}

/**
 * Get clipboard error message
 */
export function getClipboardError() {
  if (!isBrowser()) {
    return "Clipboard not available (not in browser)";
  }

  if (!window.isSecureContext) {
    return "Clipboard requires HTTPS or localhost";
  }

  if (!navigator.clipboard) {
    return "Clipboard API not supported in this browser";
  }

  return "Clipboard access denied. Check browser permissions.";
}

/**
 * Generate safe filename from text
 */
export function sanitizeFilename(text, fallback = "diagram") {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/gi, "");

  return cleaned || fallback;
}

/**
 * Get timestamp string for filenames
 */
export function getTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Safe query selector
 */
export function safeQuerySelector(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch (e) {
    console.warn(`DiagView: Invalid selector "${selector}"`, e);
    return null;
  }
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
 * Check if element is visible
 */
export function isElementVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

/**
 * Get element dimensions
 */
export function getElementDimensions(element) {
  if (!element) return { width: 0, height: 0 };

  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Lazy load script
 */
export function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Check for required dependencies
 */
export function checkPanzoomDependency() {
  return typeof window.Panzoom !== "undefined";
}

/**
 * Fix ID collisions in SVG elements
 * When multiple SVGs exist on a page, they may have duplicate IDs
 * which causes rendering issues with gradients, patterns, and clip paths.
 * This function prefixes all IDs with a unique identifier.
 * @param {SVGElement} svg - The SVG element to fix
 * @param {string} uniqueId - Unique prefix for IDs
 * @returns {SVGElement} - The fixed SVG element (may be a new element)
 */
export function fixIds(svg, uniqueId) {
  if (!svg) return svg;

  const defs = svg.querySelector("defs");
  if (!defs) return svg;

  const idMap = new Map();

  // Collect all IDs in defs and rename them
  defs.querySelectorAll("[id]").forEach((el) => {
    const oldId = el.id;
    const newId = `${uniqueId}-${oldId}`;
    el.id = newId;
    idMap.set(oldId, newId);
  });

  // If no IDs were changed, return original
  if (idMap.size === 0) return svg;

  // Replace all URL references and href references
  let html = svg.outerHTML;
  idMap.forEach((newId, oldId) => {
    // Replace url(#oldId) with url(#newId)
    html = html.replace(new RegExp(`url\\(#${oldId}\\)`, "g"), `url(#${newId})`);
    // Replace href="#oldId" with href="#newId"
    html = html.replace(new RegExp(`href="#${oldId}"`, "g"), `href="#${newId}"`);
    // Replace xlink:href="#oldId" (older SVG spec)
    html = html.replace(new RegExp(`xlink:href="#${oldId}"`, "g"), `xlink:href="#${newId}"`);
  });

  // Create new SVG from modified HTML
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const newSvg = temp.querySelector("svg");

  if (newSvg) {
    svg.replaceWith(newSvg);
    return newSvg;
  }

  return svg;
}

/**
 * Generate a unique ID for diagram instances
 * @returns {string} Unique generated ID
 */
export function generateUniqueId() {
  return `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Set CSS style only if value has changed (dirty checking)
 * Prevents unnecessary reflows
 * @param {HTMLElement} element - Element to update
 * @param {string} property - CSS property name
 * @param {string} value - CSS property value
 * @returns {boolean} True if style was changed
 */
export function setStyleIfChanged(element, property, value) {
  if (!element) return false;

  if (element.style[property] !== value) {
    element.style[property] = value;
    return true;
  }

  return false;
}

/**
 * Batch update multiple styles with dirty checking
 * @param {HTMLElement} element - Element to update
 * @param {object} styles - Object with property: value pairs
 * @returns {number} Number of styles that were changed
 */
export function batchSetStyles(element, styles) {
  if (!element) return 0;

  let changedCount = 0;

  for (const [property, value] of Object.entries(styles)) {
    if (setStyleIfChanged(element, property, value)) {
      changedCount++;
    }
  }

  return changedCount;
}

/**
 * Toggle CSS class with optional force parameter
 * @param {HTMLElement} element - Element to update
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add (true) or remove (false)
 */
export function toggleClass(element, className, force) {
  if (!element) return;
  element.classList.toggle(className, force);
}

/**
 * Request animation frame with fallback
 * @param {Function} callback - Callback function
 * @returns {number} RAF ID
 */
export function raf(callback) {
  return (
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    function (cb) {
      return setTimeout(cb, 16);
    }
  )(callback);
}

/**
 * Cancel animation frame with fallback
 * @param {number} id - RAF ID to cancel
 */
export function cancelRaf(id) {
  return (
    window.cancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    clearTimeout
  )(id);
}
