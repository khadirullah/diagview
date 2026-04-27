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
  if (!isBrowser()) return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches ||
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
 * Throttle function execution with trailing-edge support
 * @param {Function} func - Function to throttle
 * @param {number} limit - Throttle limit in ms
 * @returns {any|undefined} - Function result if executed, undefined if throttled
 */
export function throttle(func, limit) {
  let inThrottle;
  let lastFunc;
  let lastResult;

  return function (...args) {
    const context = this;
    if (!inThrottle) {
      lastResult = func.apply(context, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastFunc) {
          lastResult = func.apply(lastFunc.context, lastFunc.args);
          lastFunc = null;
        }
      }, limit);
      return lastResult;
    } else {
      lastFunc = { context, args };
      // Fix for Bug #15: Return undefined on throttled calls to signal it didn't run
      return undefined;
    }
  };
}

/**
 * Check if clipboard API is available
 */
export function isClipboardAvailable() {
  return isBrowser() && navigator.clipboard && typeof navigator.clipboard.write === "function";
}

/**
 * Check if sessionStorage is available and functional
 * (May throw SecurityError in Safari Private Mode or if storage is full)
 */
let _storageAvailableCache = null;

export function isSessionStorageAvailable() {
  if (!isBrowser()) return false;
  if (_storageAvailableCache !== null) return _storageAvailableCache;

  try {
    const key = "__diagview_test_storage__";
    sessionStorage.setItem(key, "test");
    sessionStorage.removeItem(key);
    _storageAvailableCache = true;
  } catch (e) {
    _storageAvailableCache = false;
  }
  return _storageAvailableCache;
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
  const n = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const d = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  const t = `${pad(n.getHours())}${pad(n.getMinutes())}${pad(n.getSeconds())}`;
  return `${d}_${t}`;
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
 * Lazy load script
 */
export function loadScript(url, integrity = null) {
  return new Promise((resolve, reject) => {
    // Safety check for SSR environments
    if (!isBrowser()) {
      resolve();
      return;
    }

    // Check if already loaded using absolute URL matching
    const absoluteUrl = new URL(url, window.location.href).href;
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
    script.onload = resolve;
    script.onerror = () => {
      let errorMsg = `Failed to load script: ${url}`;
      if (integrity) {
        errorMsg += ". This may be due to a Subresource Integrity (SRI) mismatch.";
      }
      reject(new Error(errorMsg));
    };
    document.head.appendChild(script);
  });
}

/**
 * Sanitize an SVG string to prevent XSS.
 * Removes <script> tags and 'on*' event attributes using a secure DOMParser.
 * @param {string} svgString - The SVG string to sanitize
 * @returns {string} - The sanitized SVG string
 */
export function sanitizeSVG(svgString) {
  if (!svgString || typeof svgString !== "string") return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    // If parsing fails, return empty
    if (doc.querySelector("parsererror")) return "";

    const cleanElement = (el) => {
      // Remove scripts
      if (el.tagName.toLowerCase() === "script") {
        el.remove();
        return;
      }

      // Remove event handlers
      const attrs = el.attributes;
      if (attrs) {
        for (let i = attrs.length - 1; i >= 0; i--) {
          const attrName = attrs[i].name.toLowerCase();
          if (attrName.startsWith("on")) {
            el.removeAttribute(attrs[i].name);
          }
        }
      }

      // Recurse
      const children = Array.from(el.children);
      children.forEach(cleanElement);
    };

    cleanElement(doc.documentElement);
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch (e) {
    console.error("DiagView: SVG Sanitization failed", e);
    return "";
  }
}

/**
 * Check for required dependencies
 */
export function checkPanzoomDependency() {
  return typeof window.Panzoom !== "undefined";
}

/**
 * Fix ID collisions in SVG elements using a secure DOM-walking approach.
 * Replaces the unsafe and slow outerHTML/RegExp strategy with direct attribute manipulation.
 * This prevents XSS (no innerHTML parsing) and is significantly faster.
 *
 * @param {SVGElement} svg - The SVG element to fix
 * @param {string} uniqueId - Unique prefix for IDs
 * @returns {SVGElement} - The modified SVG element
 */
export function fixIds(svg, uniqueId) {
  if (!svg || !uniqueId) return svg;

  const idMap = new Map();
  const idElements = svg.querySelectorAll("[id]");

  // 1. Build the ID map
  idElements.forEach((el) => {
    const oldId = el.id;
    const newId = `${uniqueId}-${oldId}`;
    idMap.set(oldId, newId);
    el.id = newId; // Update the definition immediately
  });

  if (idMap.size === 0) return svg;

  // 2. Walk the DOM once and update all references using a secure Map lookup.
  // We use a simple static regex to find all #references and then check our map.
  // This is O(1) per replacement and immune to ReDoS.
  const idRefRegex = /#([^\s"'()]+)/g;
  const allElements = svg.querySelectorAll("*");

  allElements.forEach((el) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const value = attr.value;

      if (!value || !value.includes("#")) continue;

      const newValue = value.replace(idRefRegex, (match, id) => {
        return idMap.has(id) ? `#${idMap.get(id)}` : match;
      });

      if (newValue !== value) {
        attr.value = newValue;
      }
    }
  });

  return svg;
}

/**
 * Safely set SVG content without innerHTML.
 * Uses DOMParser to create a safe document and then moves nodes over.
 * @param {SVGElement} el - Target SVG element
 * @param {string} svgContent - SVG string (can be full <svg> tag or just child paths)
 */
export function setSVGContent(el, svgContent) {
  if (!el || !svgContent) return;

  try {
    const parser = new DOMParser();
    // If it's a full <svg> tag, we want the children
    const wrappedContent = svgContent.trim().startsWith("<svg")
      ? svgContent
      : `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;

    const doc = parser.parseFromString(wrappedContent, "image/svg+xml");
    const svgEl = doc.querySelector("svg");

    if (svgEl && !doc.querySelector("parsererror")) {
      el.replaceChildren(...Array.from(svgEl.childNodes));
    }
  } catch (e) {
    console.error("DiagView: Failed to set SVG content", e);
  }
}

/**
 * Generate a unique ID for diagram instances
 * @returns {string} Unique generated ID
 */
export function generateUniqueId() {
  return `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

