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
