/**
 * DiagView Observer Module
 * Watches for new diagrams in the DOM and initializes them
 * @module core/observer
 */

import { state } from "./config.js";
import { TIMING } from "./constants.js";
import { debounce, safeQuerySelectorAll, stripDiagViewParams } from "./utils.js";
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

  // Fast Path: If no DiagView parameters are in the URL, we never need to check again
  if (!window.location.search.includes("dv-")) {
    state.hasCheckedShareLink = true;
    return;
  }

  const selector = state.config.diagramSelector;
  const allDiagrams = safeQuerySelectorAll(selector, document);

  if (allDiagrams.length === 0) return;

  const result = restoreViewFromURL(allDiagrams);
  if (result) {
    // Found a target diagram! Open it.
    // Use timeout to ensure UI is ready
    setTimeout(() => {
      // Defensive wrapping handles both real Promises and test mocks
      Promise.resolve(openFullscreen(result.diagram)).catch((e) => {
        console.warn("DiagView: Failed to restore shared view", e);
      });
    }, TIMING.OBSERVER_DEBOUNCE);
  }

  state.hasCheckedShareLink = true;

  // Cleanup URL to remove internal dv- parameters after processing
  stripDiagViewParams();
}

/**
 * Get or create the global IntersectionObserver for lazy initialization.
 * OPT-2: Defers initialization until diagrams are near the viewport.
 * @returns {IntersectionObserver|null}
 */
function getLazyObserver() {
  if (state.lazyObserver) return state.lazyObserver;

  if (typeof IntersectionObserver === "undefined") return null;

  state.lazyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const diagram = entry.target;
          const index = parseInt(diagram.dataset.diagviewIndex ?? "-1", 10);
          initializeDiagram(diagram, index);
          state.lazyObserver?.unobserve(diagram);
        }
      });
    },
    {
      rootMargin: "200px", // Boot up 200px before they enter viewport for zero perceived delay
    },
  );

  return state.lazyObserver;
}

/**
 * Process diagrams within a specific root
 */
export function processDiagrams(root = document) {
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

  const allDiagrams = safeQuerySelectorAll(selector, document);

  // MAJ-3: Use a Map for O(1) index lookups to avoid O(N^2) complexity on large pages.
  // This ensures the library scales linearly even with hundreds of diagrams.
  const indexMap = new Map(allDiagrams.map((d, i) => [d, i]));

  diagrams.forEach((diagram) => {
    // Check if diagram is ready (has SVG) and not already initialized
    const hasSvg = diagram.querySelector("svg");
    const isInitialized = diagram.dataset.diagviewInit;

    // Cache the global index early to assist lazy initialization and share links
    const index = indexMap.get(diagram) ?? -1;
    diagram.dataset.diagviewIndex = String(index);

    if (hasSvg && !isInitialized) {
      const observer = getLazyObserver();
      if (observer) {
        observer.observe(diagram);
      } else {
        // Fallback for environments without IntersectionObserver support
        initializeDiagram(diagram, index);
      }
    }
  });
}

/**
 * Start observing for new diagrams
 */
export function observeDiagrams() {
  // Guard: Ensure we don't leak duplicate observers if called multiple times
  if (state.observer) {
    stopObserving();
  }

  // Process existing diagrams immediately
  if (!state.isInitialProcessDone) {
    processDiagrams(document.body);
    state.isInitialProcessDone = true;
  }

  // Define debounced processor (stored at module level for cancellation)
  state.debouncedProcess = debounce(() => {
    if (state.nodesToProcess.size === 0) return;

    state.nodesToProcess.forEach((node) => {
      // Check if node is still in the document
      if (node && document.body.contains(node)) {
        processDiagrams(node);
      }
    });

    state.nodesToProcess.clear();

    // Check for share link (Deep linking) - Always check globally
    checkShareLink();
  }, TIMING.OBSERVER_DEBOUNCE);

  state.observer = new MutationObserver((mutations) => {
    let addedAny = false;

    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          state.nodesToProcess.add(node);
          addedAny = true;
        }
      }
    }

    if (addedAny) {
      state.debouncedProcess();
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
  if (state.lazyObserver) {
    state.lazyObserver.disconnect();
    state.lazyObserver = null;
  }
  // Cancel any pending debounce timer to prevent ghost callbacks
  if (state.debouncedProcess) {
    state.debouncedProcess.cancel();
    state.debouncedProcess = null;
  }
  state.nodesToProcess.clear();
  state.isInitialProcessDone = false;
}

/**
 * Manually refresh diagrams
 */
export function refreshDiagrams() {
  processDiagrams();
  checkShareLink();
}
