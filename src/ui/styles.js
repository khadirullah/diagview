/**
 * DiagView CSS Styles
 * Injects optimized, production-ready CSS
 * @module ui/styles
 */

import cssContent from "./styles.css";

export function injectStyles() {
  if (document.getElementById("diagview-styles")) return;

  const style = document.createElement("style");
  style.id = "diagview-styles";
  style.textContent = cssContent;
  document.head.appendChild(style);
}

export function removeStyles() {
  const style = document.getElementById("diagview-styles");
  if (style) {
    style.remove();
  }
}

// Shared constructable stylesheet for shadow roots (built on first use)
let sharedSheet = null;

function supportsAdoptedSheets(root) {
  return (
    "adoptedStyleSheets" in root &&
    typeof CSSStyleSheet === "function" &&
    typeof CSSStyleSheet.prototype.replaceSync === "function"
  );
}

/**
 * Inject the DiagView stylesheet into a shadow root so toolbars built inside
 * it are styled. Uses adoptedStyleSheets when available, else a <style> tag.
 * @param {ShadowRoot} root - Shadow root to style
 */
export function injectStylesInto(root) {
  if (!root) return;

  if (supportsAdoptedSheets(root)) {
    if (!sharedSheet) {
      sharedSheet = new CSSStyleSheet();
      sharedSheet.replaceSync(cssContent);
    }
    if (!root.adoptedStyleSheets.includes(sharedSheet)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedSheet];
    }
    return;
  }

  if (root.querySelector("style[data-diagview-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-diagview-styles", "");
  style.textContent = cssContent;
  root.appendChild(style);
}

/**
 * Remove the stylesheet injected by injectStylesInto().
 * @param {ShadowRoot} root - Shadow root previously passed to injectStylesInto()
 */
export function removeStylesFrom(root) {
  if (!root) return;

  if (sharedSheet && supportsAdoptedSheets(root)) {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => sheet !== sharedSheet);
  }

  root.querySelectorAll?.("style[data-diagview-styles]").forEach((style) => style.remove());
}
