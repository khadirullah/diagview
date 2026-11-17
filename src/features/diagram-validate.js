/**
 * DiagView Diagram Validation
 * Checks a diagram's SVG and shows the error box for one that is broken
 * @module features/diagram-validate
 */

import { state } from "../core/config.js";
import { setSVGContent, hasDrawnContent, SHAPES } from "../core/utils.js";

/**
 * Check if SVG is valid and renderable
 */
export function isValidSvg(svg) {
  if (!svg) return false;

  // 1. Check for browser-native XML parsing errors (malformed SVG)
  if (svg.querySelector("parsererror")) return false;

  // 2. Check if SVG has any visible structural content
  if (!hasDrawnContent(svg)) return false;

  // 3. Check for specific error indicators from popular libraries (like Mermaid).
  // Only match library-specific error elements — NOT the generic ".error" class which
  // can legitimately appear on diagram content nodes (e.g., an "error handling" flowchart node).
  // Mermaid 10 and 11 draw a syntax error as a diagram of type "error", with
  // an empty .error-icon, so its role description is what gives it away.
  const rootError =
    svg.classList?.contains("error") ||
    svg.matches?.(".mermaid-error") ||
    svg.getAttribute("aria-roledescription") === "error";
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

  // Element ids are no sign of an error. Mermaid 11 and later put the SVG id
  // in front of each node id, so a valid node named errorHandler gets the id
  // "mermaid-1-flowchart-errorHandler-0". Mermaid's own error picture has no
  // id with "error" in it, and the checks above already catch it.

  // 4. Check for zero dimensions in an explicit viewBox (empty content area).
  // Only when the attribute is present: without one, viewBox.baseVal is a
  // 0x0 SVGRect in browsers, which rejected every width/height-only SVG.
  const vb = (svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb.length === 4 && (vb[2] === 0 || vb[3] === 0)) return false;

  // 5. Check for text-only error fragments (often returned by failed backend renders).
  // HTML in a <foreignObject> is text too.
  const shapes = svg.querySelector(SHAPES);
  if (!shapes) {
    const textElements = svg.querySelectorAll("text, foreignObject");
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

/** Longest reason the error box shows, in characters */
const MAX_REASON = 300;

/**
 * The parser message Mermaid 12 writes into its error picture, under the
 * "Syntax error in text" headline and the version line. Mermaid 10 and 11
 * draw only those two lines, so they give an empty string. Read as text,
 * never as markup, since it quotes the diagram code.
 * @param {SVGSVGElement|null} svg - The SVG that failed validation
 * @returns {string} The reason on one line, or ""
 */
function readErrorReason(svg) {
  const lines = Array.from(svg?.querySelectorAll("text.error-text") || [], (t) =>
    (t.textContent || "").trim(),
  ).filter((line) => line && !/^(syntax error in text|mermaid version\b)/i.test(line));
  const reason = lines
    .join(" ")
    // The run of dashes ending in ^ points at a column on the line above. It
    // only lines up in Mermaid's own monospace layout.
    .replace(/\s*-{3,}\^/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 1).trimEnd()}\u2026` : reason;
}

/**
 * Show error boundary UI for broken diagrams
 * @returns {HTMLElement} The error UI element that was appended
 */
export function showErrorBoundary(element, svg) {
  // Mark as error state
  element.dataset.diagviewError = "1";

  // Create error UI
  const errorDiv = document.createElement("div");
  errorDiv.className = "diagview-error";

  // Detect specific error type
  let errorTitle = "Diagram Error";
  let errorMessage = "This diagram could not be rendered properly.";
  const reason = readErrorReason(svg);

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

  // The icon is fixed markup. The text from the SVG only ever goes in
  // through textContent below, so it cannot add elements. Round caps draw
  // the zero-length path under the "!" as a dot. The title says the same in
  // words, so screen readers skip the icon.
  setSVGContent(
    errorDiv,
    '<svg class="diagview-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  );

  const titleDiv = document.createElement("div");
  titleDiv.className = "diagview-error-title";
  titleDiv.textContent = errorTitle;

  const msgDiv = document.createElement("div");
  msgDiv.className = "diagview-error-message";
  msgDiv.textContent = errorMessage;

  errorDiv.appendChild(titleDiv);
  errorDiv.appendChild(msgDiv);

  if (reason) {
    const detailDiv = document.createElement("div");
    detailDiv.className = "diagview-error-detail";
    detailDiv.textContent = reason;
    errorDiv.appendChild(detailDiv);
  }

  // Replace content or append. An <svg> matched by the selector cannot hold
  // the HTML box, so it goes right after it.
  if (svg) {
    svg.style.display = "none";
  }
  if (svg === element) element.after(errorDiv);
  else element.appendChild(errorDiv);

  // Fire onError callback if configured (A2: was documented but never called)
  if (state.config.onError) {
    try {
      const detail = reason ? ` ${reason}` : "";
      state.config.onError(new Error(`DiagView: ${errorTitle}, ${errorMessage}${detail}`));
    } catch (e) {
      console.error("DiagView: onError callback threw:", e);
    }
  }

  return errorDiv;
}
