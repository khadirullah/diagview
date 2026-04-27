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

// Share Link Handling (State managed via config.js)

/**
 * Check for share link and open if needed.
 * This MUST use a global query of the document to ensure the 'dvIdx'
 * parameter correctly matches the diagram's index on the whole page.
 */
function checkShareLink() {
  if (state.hasCheckedShareLink) return;

  const selector = state.config.diagramSelector;
  const allDiagrams = safeQuerySelectorAll(selector, document);

  if (allDiagrams.length === 0) return;

  const result = restoreViewFromURL(allDiagrams);
  if (result) {
    // Found a target diagram! Open it.
    // Use timeout to ensure UI is ready
    setTimeout(() => {
      openFullscreen(result.diagram);
    }, 100);
  }

  state.hasCheckedShareLink = true;
}

/**
 * Process diagrams within a specific root
 */
function processDiagrams(root = document) {
  // Ensure modal exists
  if (!document.getElementById("diagview-modal")) {
    createModal();
  }

  const selector = state.config.diagramSelector;
  const diagrams = [];

  // If root itself matches, add it
  if (root.nodeType === 1 && root.matches?.(selector)) {
    diagrams.push(root);
  }

  // Find all diagrams within root
  if (root.querySelectorAll) {
    diagrams.push(...safeQuerySelectorAll(selector, root));
  }

  diagrams.forEach((diagram) => {
    // Check if diagram is ready (has SVG or is processed)
    const hasSvg = diagram.querySelector("svg");
    const isProcessed = diagram.getAttribute("data-processed") === "true";
    const isInitialized = diagram.dataset.diagviewInit;

    if ((hasSvg || isProcessed) && !isInitialized) {
      initializeDiagram(diagram);
    }
  });

  // Check for share link (Deep linking) - Always check globally
  checkShareLink();
}

// Internal queue for debounced processing
const nodesToProcess = new Set();

/**
 * Start observing for new diagrams
 */
export function observeDiagrams() {
  if (state.observer) return;

  // Process existing diagrams immediately
  if (!state.isInitialProcessDone) {
    processDiagrams(document.body);
    state.isInitialProcessDone = true;
  }

  // Define debounced processor
  const debouncedProcess = debounce(() => {
    if (nodesToProcess.size === 0) return;

    nodesToProcess.forEach((node) => {
      // Check if node is still in the document
      if (document.body.contains(node)) {
        processDiagrams(node);
      }
    });

    nodesToProcess.clear();
  }, TIMING.OBSERVER_DEBOUNCE);

  state.observer = new MutationObserver((mutations) => {
    let addedAny = false;

    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          nodesToProcess.add(node);
          addedAny = true;
        }
      }
    }

    if (addedAny) {
      debouncedProcess();
    }
  });

  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Reset share link check flag
 */
export function resetShareLinkCheck() {
  state.hasCheckedShareLink = false;
}

/**
 * Stop observing diagrams
 */
export function stopObserving() {
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
  nodesToProcess.clear();
  state.isInitialProcessDone = false;
}

/**
 * Manually refresh diagrams
 */
export function refreshDiagrams() {
  processDiagrams();
}
