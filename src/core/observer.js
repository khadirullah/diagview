/**
 * DiagView Observer Module
 * Watches for new diagrams in the DOM and initializes them
 * @module core/observer
 */

import { state } from "./config.js";
import { TIMING } from "./constants.js";
import { debounce, safeQuerySelectorAll } from "./utils.js";
import { initializeDiagram } from "../features/diagram-init.js";
import { createModal, openFullscreen } from "../ui/modal.js";
import { restoreViewFromURL } from "../features/lazy/share.js";

// Share Link Handling
let hasCheckedShareLink = false;

/**
 * Check for share link and open if needed
 * Runs only once per session
 */
function checkShareLink(diagrams) {
  if (hasCheckedShareLink || diagrams.length === 0) return;

  const result = restoreViewFromURL(diagrams);
  if (result) {
    // Found a target diagram! Open it.
    // Use timeout to ensure UI is ready
    setTimeout(() => {
      openFullscreen(result.diagram);
    }, 100);
  }

  hasCheckedShareLink = true;
}

/**
 * Process diagrams in batch
 */
function processDiagrams() {
  // Ensure modal exists
  if (!document.getElementById("diagview-modal")) {
    createModal();
  }

  // Find and initialize diagrams
  const diagrams = safeQuerySelectorAll(state.config.diagramSelector);

  diagrams.forEach((diagram) => {
    // Check if diagram is ready (has SVG or is processed)
    const hasSvg = diagram.querySelector("svg");
    const isProcessed = diagram.getAttribute("data-processed") === "true";
    const isInitialized = diagram.dataset.diagviewInit;

    if ((hasSvg || isProcessed) && !isInitialized) {
      initializeDiagram(diagram);
    }
  });

  // Check for share link (Deep linking)
  checkShareLink(diagrams);
}

/**
 * Start observing for new diagrams
 */
export function observeDiagrams() {
  if (state.observer) return;

  // Debounced processor for performance
  const debouncedProcess = debounce(processDiagrams, TIMING.OBSERVER_DEBOUNCE);

  state.observer = new MutationObserver((mutations) => {
    let hasNewDiagrams = false;

    // Only process childList mutations
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Element nodes only

        // Check if node is a diagram or contains diagrams
        const selector = state.config.diagramSelector;
        try {
          if (node.matches?.(selector) || node.querySelector?.(selector)) {
            hasNewDiagrams = true;
            break;
          }
        } catch (e) {
          // Invalid selector
          console.warn("DiagView: Invalid selector", e);
        }
      }

      if (hasNewDiagrams) break;
    }

    if (hasNewDiagrams) {
      debouncedProcess();
    }
  });

  // Only observe childList to prevent performance issues
  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Process existing diagrams
  processDiagrams();
}

/**
 * Stop observing diagrams
 */
export function stopObserving() {
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
}

/**
 * Manually refresh diagrams
 */
export function refreshDiagrams() {
  processDiagrams();
}
