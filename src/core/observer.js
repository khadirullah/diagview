/**
 * DiagView Observer Module
 * Watches for new diagrams in the DOM and initializes them
 * @module core/observer
 */

import { state } from "./config.js";
import { TIMING } from "./constants.js";
import {
  debounce,
  getDiagramSvg,
  hasDrawnContent,
  safeQuerySelectorAll,
  stripDiagViewParams,
} from "./utils.js";
import {
  initializeDiagram,
  deinitializeDiagram,
  recheckDiagram,
  releaseDetachedDiagrams,
} from "../features/diagram-init.js";
import { createModal, openFullscreen } from "../ui/modal.js";
import { restoreViewFromURL } from "../features/lazy/share.js";

// Share Link Handling (State managed via config.js)

/** Milliseconds a share link waits for its diagram before it is removed */
const SHARE_LINK_WAIT = 3000;
let stripTimer = 0;

/** Whether the page removed an element since the last run */
let removedAny = false;

/**
 * Every diagram DiagView knows about, in a stable order: the document first,
 * then each shadow root passed to initShadowRoot() in registration order.
 * This is the list data-diagview-index and share links (dv-idx) refer to.
 * @returns {Element[]} Diagram containers in index order
 */
export function collectAllDiagrams() {
  const selector = state.config.diagramSelector;
  const all = [...safeQuerySelectorAll(selector, document)];
  state.shadowRoots.forEach((root) => {
    if (root?.querySelectorAll) all.push(...safeQuerySelectorAll(selector, root));
  });
  return all;
}

/**
 * Check for share link and open if needed.
 * This MUST use the global diagram list (document + shadow roots) so the
 * 'dvIdx' parameter matches the index stamped on each diagram.
 */
export function checkShareLink() {
  if (state.hasCheckedShareLink) return;

  // Fast Path: If no DiagView parameters are in the URL, we never need to check again
  if (!window.location.search.includes("dv-")) {
    state.hasCheckedShareLink = true;
    return;
  }

  const allDiagrams = collectAllDiagrams();

  if (allDiagrams.length === 0) return;

  const result = restoreViewFromURL(allDiagrams);
  if (result) {
    // Found a target diagram! Check if it's "ready" (has an SVG)
    // If the website is lazy-loading the SVG itself, we must wait for it.
    if (!getDiagramSvg(result.diagram)) {
      return; // Keep hasCheckedShareLink = false to try again on next mutation
    }

    // Use timeout to ensure UI is ready
    setTimeout(() => {
      // Defensive wrapping handles both real Promises and test mocks
      Promise.resolve(openFullscreen(result.diagram)).catch((e) => {
        console.warn("DiagView: Failed to restore shared view", e);
      });
    }, TIMING.OBSERVER_DEBOUNCE);
  } else {
    // The diagram may come later, from initShadowRoot(), refresh() or a
    // late render, and each of those checks again. A link that still
    // matches nothing, such as dv-idx=99, leaves the address bar after a
    // wait, so it is not bookmarked or passed on.
    stripTimer ||= setTimeout(() => {
      stripTimer = 0;
      if (!state.hasCheckedShareLink) {
        state.hasCheckedShareLink = true;
        stripDiagViewParams();
      }
    }, SHARE_LINK_WAIT);
    return;
  }

  // Remove the dv- parameters from the address bar once the link is handled
  state.hasCheckedShareLink = true;
  stripDiagViewParams();
}

/**
 * Get or create the global IntersectionObserver for lazy initialization.
 * OPT-2: Defers initialization until diagrams are near the viewport.
 * @returns {IntersectionObserver|null} The shared observer, or null when unsupported
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
 * Choose one toolbar where matches sit inside each other, such as a .mermaid
 * inside a .diagram with the selector ".mermaid, .diagram". An outer match
 * holding a single diagram keeps the toolbar, because it carries data-title
 * and the data-diagview-* settings. An outer match holding two or more
 * diagrams gives way to the inner ones, so each keeps its own fullscreen
 * button. The choice depends on the markup alone, never on which diagram
 * lazy init reached first.
 *
 * The outer and inner matches it looks at are appended to `diagrams`, so a
 * scan that starts inside a nested group settles the whole group.
 * @param {Element[]} diagrams - Matches to process, extended in place
 * @param {string} selector - Diagram selector
 * @returns {Set<Element>} Matches that must not get a toolbar
 */
function skipNestedDiagrams(diagrams, selector) {
  const skipped = new Set();
  // Outer match -> whether it holds two or more diagrams
  const groups = new Map();
  let seen = null;
  const add = (el) => {
    if (!seen) seen = new Set(diagrams);
    if (!seen.has(el)) {
      seen.add(el);
      diagrams.push(el);
    }
  };

  for (let i = 0; i < diagrams.length; i++) {
    const outer = diagrams[i].parentElement?.closest(selector);
    if (!outer) continue;

    let many = groups.get(outer);
    if (many === undefined) {
      const inner = safeQuerySelectorAll(selector, outer);
      // Count SVGs, not matches. In .diagram > .chart > .mermaid every level
      // holds the same single SVG.
      many = new Set(inner.map(getDiagramSvg).filter(Boolean)).size > 1;
      groups.set(outer, many);
      if (many) inner.forEach(add);
    }
    skipped.add(many ? outer : diagrams[i]);
    add(outer);
  }
  return skipped;
}

/**
 * The diagrams in a root, the root itself first when it matches
 * @param {Element|Document|ShadowRoot} root - Where to look
 * @param {string} selector - Diagram selector
 * @returns {Element[]} Matches in document order
 */
function findDiagrams(root, selector) {
  const diagrams = root.nodeType === 1 && root.matches?.(selector) ? [root] : [];
  if (root.querySelectorAll) diagrams.push(...safeQuerySelectorAll(selector, root));
  return diagrams;
}

/**
 * Process diagrams within a specific root
 */
export function processDiagrams(root = document) {
  setUpDiagrams(findDiagrams(root, state.config.diagramSelector));
}

/**
 * Give each diagram its index and set up the ones that are ready
 * @param {Element[]} diagrams - Matches to process
 */
function setUpDiagrams(diagrams) {
  // Ensure modal exists
  if (!document.getElementById("diagview-modal")) {
    createModal();
  }

  // Nothing to index, so the page is not scanned
  if (diagrams.length === 0) return;

  const selector = state.config.diagramSelector;

  // MAJ-3: Use a Map for O(1) index lookups to avoid O(N^2) complexity on large pages.
  // This ensures the library scales linearly even with hundreds of diagrams.
  // Diagrams in shadow roots come after the document's, so they get a real
  // index instead of -1 and share links can find them again.
  const allDiagrams = collectAllDiagrams();
  const indexMap = new Map(allDiagrams.map((d, i) => [d, i]));
  const skipped = skipNestedDiagrams(diagrams, selector);

  diagrams.forEach((diagram) => {
    // A diagram that is set up keeps its init flag. When its content has
    // changed since, from a fix in the editor or a new render, it may be
    // released here and then set up below like a new diagram.
    if (diagram.dataset.diagviewInit) recheckDiagram(diagram);

    // Cache the global index early to assist lazy initialization and share
    // links. Skipped diagrams keep theirs, so link numbers never shift.
    const index = indexMap.get(diagram) ?? -1;

    if (skipped.has(diagram)) {
      state.lazyObserver?.unobserve(diagram);
      // Set up earlier under the other rule, before a diagram was added or
      // removed next to it
      deinitializeDiagram(diagram);
      diagram.dataset.diagviewIndex = String(index);
      return;
    }
    diagram.dataset.diagviewIndex = String(index);

    // Check if diagram is ready (has SVG) and not already initialized. An
    // <svg> matched by the selector waits until something is drawn in it.
    const svg = getDiagramSvg(diagram);
    const hasSvg = svg && (svg !== diagram || hasDrawnContent(svg));
    const isInitialized = diagram.dataset.diagviewInit;

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
    // Check for share link immediately after initial processing
    checkShareLink();
  }

  // Define debounced processor (stored at module level for cancellation)
  state.debouncedProcess = debounce(() => {
    // Let go of diagrams that left the page, so a single-page app that
    // swaps routes without destroy() does not keep the old ones in memory.
    // Only checked after the page removed something. A node the page moves,
    // or takes out and puts back before this runs, is on the page again by
    // now and keeps its toolbar. One put back later is set up again.
    if (removedAny) {
      removedAny = false;
      releaseDetachedDiagrams();
    }

    if (state.nodesToProcess.size === 0) return;

    // Gather the diagrams in or around every added node first, so the page
    // is scanned for the index once per run, and not at all when a script
    // only added text, list items or other plain markup
    const selector = state.config.diagramSelector;
    const found = new Set();
    state.nodesToProcess.forEach((node) => {
      // Check if node is still in the document
      if (node && document.body.contains(node)) {
        findDiagrams(node, selector).forEach((diagram) => found.add(diagram));
      }
    });
    state.nodesToProcess.clear();

    setUpDiagrams([...found]);

    // Check for share link (Deep linking) - Always check globally. A link
    // waiting for its diagram or that diagram's SVG can only resolve when
    // one of them arrives.
    if (found.size > 0) checkShareLink();
  }, TIMING.OBSERVER_DEBOUNCE);

  state.observer = new MutationObserver((mutations) => {
    let addedAny = false;
    const selector = state.config.diagramSelector;

    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      if (!removedAny) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1) {
            removedAny = true;
            break;
          }
        }
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        state.nodesToProcess.add(node);
        addedAny = true;

        // The node may be the SVG (or a fragment) arriving inside a container
        // that already existed but was skipped for having no SVG yet. Queue
        // that container too, otherwise it is never initialized. A container
        // that is set up is queued when a new SVG arrives in it, or on any
        // change while it shows the error box, so it is checked again.
        let container = null;
        try {
          container = node.parentElement?.closest(selector) ?? null;
        } catch (_e) {
          container = null;
        }
        if (
          container &&
          (!container.dataset.diagviewInit ||
            container.dataset.diagviewError ||
            node.localName === "svg" ||
            node.querySelector?.("svg"))
        ) {
          state.nodesToProcess.add(container);
        }
      }
    }

    if (addedAny || removedAny) {
      state.debouncedProcess();
    }
  });

  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Reset share link check flag and cancel a pending share link removal
 */
export function resetShareLinkCheck() {
  state.hasCheckedShareLink = false;
  clearTimeout(stripTimer);
  stripTimer = 0;
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
  removedAny = false;
  state.isInitialProcessDone = false;
}

/**
 * Manually refresh diagrams
 */
export function refreshDiagrams() {
  processDiagrams();
  checkShareLink();
}
