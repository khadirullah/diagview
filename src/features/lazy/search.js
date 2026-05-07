/**
 * DiagView Search Functionality
 * Optimized for performance: Caching + Batching + Dirty Checking
 * @module features/lazy/search
 */

import { state } from "../../core/config.js";
import { TIMING, SELECTORS } from "../../core/constants.js";
import { throttle } from "../../core/utils.js";
import { addModalListener, registerRAF } from "../../core/lifecycle.js";

/**
 * Module-level reference to the active search throttle.
 * This allows clearSearch to cancel pending background tasks.
 * @type {Function|null}
 */
let activeSearchThrottle = null;

/**
 * Generation counter to detect and discard stale search RAF callbacks.
 * Incremented on every performSearch and clearSearch call.
 */
let searchGeneration = 0;

/**
 * Initialize or retrieve search cache
 * O(N) read operation, done once per diagram instance (or refresh)
 */
function getSearchCandidates(clone) {
  if (state.searchCache.has(clone)) {
    return state.searchCache.get(clone);
  }

  // Use centralized selector constant
  const elements = clone.querySelectorAll(SELECTORS.SEARCH_NODES);
  const cache = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    cache.push({
      el: el,
      text: (el.textContent || "").toLowerCase(),
      isPath: el.classList.contains("edgePath"),
    });
  }

  state.searchCache.set(clone, cache);
  return cache;
}

/**
 * Clear all search highlights
 */
function clearHighlights(clone) {
  if (!clone) return;

  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);
  state.searchRafId = registerRAF(state, () => {
    if (!clone) return;
    // CRIT-5: Use cached matches instead of expensive querySelectorAll
    // This is O(k) instead of O(n), dramatically faster for large SVGs
    const toClean = state.searchMatches;
    for (let i = 0; i < toClean.length; i++) {
      toClean[i].classList.remove("dv-search-match");
    }
    state.searchRafId = null;
    state.searchMatches = []; // EVT-2: Clear state matches
  });
}

/**
 * Perform search on diagram
 */
export function performSearch(clone, query) {
  const gen = ++searchGeneration;
  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);

  // If query is empty, clear everything immediately
  if (!query || !clone) {
    if (clone) {
      clearHighlights(clone);
      clone.classList.remove("dv-searching");
    }
    state.searchMatches = [];
    return;
  }

  const lq = query.toLowerCase().trim();
  const candidates = getSearchCandidates(clone); // O(1) retrieval
  const newMatches = [];

  // Batch DOM updates in next frame
  state.searchRafId = requestAnimationFrame(() => {
    if (gen !== searchGeneration) return;
    clone.classList.add("dv-searching");

    // Single loop for O(1) DOM updates utilizing CSS fading architecture
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const isMatch = item.text.includes(lq);
      const isSearchMatch = item.el.classList.contains("dv-search-match");

      if (isMatch) {
        if (!isSearchMatch) {
          item.el.classList.add("dv-search-match");
        }
        newMatches.push(item.el);
      } else {
        if (isSearchMatch) {
          item.el.classList.remove("dv-search-match");
        }
      }
    }

    state.searchMatches = newMatches;

    // Announce match count to screen readers via aria-live region (B3)
    const statusEl = document.getElementById("diagview-search-status");
    if (statusEl) {
      statusEl.textContent =
        newMatches.length > 0
          ? `${newMatches.length} match${newMatches.length === 1 ? "" : "es"} found`
          : lq
            ? "No matches found"
            : "";
    }
  });
}

/**
 * Clear search
 */
export function clearSearch() {
  searchGeneration++;
  if (activeSearchThrottle) activeSearchThrottle.cancel();
  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);

  const searchInput = document.getElementById("diagview-search");
  const searchClear = document.getElementById("diagview-search-clear");

  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.classList.remove("show");

  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (clone) {
    clone.classList.remove("dv-searching");
    clearHighlights(clone);
  }

  state.searchMatches = [];
}

/**
 * Setup search functionality
 */
export function setupSearch(clone, initialQuery = "") {
  const searchInput = document.getElementById("diagview-search");
  const searchClear = document.getElementById("diagview-search-clear");

  if (!searchInput) return;

  // Pre-warm cache during idle time to prevent jank on first search
  const preWarm = () => {
    if (clone) getSearchCandidates(clone);
  };

  if (window.requestIdleCallback) {
    window.requestIdleCallback(preWarm, { timeout: TIMING.IDLE_TIMEOUT });
  } else {
    setTimeout(preWarm, TIMING.PREWARM_DELAY);
  }

  // Reset search state (or apply initial query)
  // CRITICAL: Catch up to what was already typed during lazy loading
  const currentQuery = searchInput.value || initialQuery || "";
  searchInput.value = currentQuery;

  if (searchClear) {
    searchClear.classList.toggle("show", !!currentQuery);
  }

  if (currentQuery) {
    // Perform initial search immediately
    performSearch(clone, currentQuery);
  }

  state.searchMatches = [];

  // Throttled search using centralized constant
  activeSearchThrottle = throttle((query) => {
    // Final safety check: Only apply search if it still matches the current input value
    const currentVal = searchInput.value || "";
    if (currentVal.toLowerCase().trim() === query.toLowerCase().trim()) {
      performSearch(clone, query);
    }
  }, TIMING.SEARCH_THROTTLE);

  // Input handler
  const handleInput = (e) => {
    const query = e.target.value;
    if (searchClear) {
      searchClear.classList.toggle("show", !!query);
    }

    // CRITICAL: If query is empty, clear immediately (bypass throttle)
    // to prevent race conditions when holding backspace.
    if (!query) {
      activeSearchThrottle.cancel();
      performSearch(clone, "");
    } else {
      activeSearchThrottle(query);
    }
  };

  addModalListener(searchInput, "input", handleInput);

  // Clear button handler
  if (searchClear) {
    const handleClear = () => {
      activeSearchThrottle.cancel();
      searchInput.value = "";
      searchClear.classList.remove("show");
      searchInput.focus();
      performSearch(clone, "");
    };
    addModalListener(searchClear, "click", handleClear);
  }

  // Keyboard navigation — Escape clears search
  // Note: Enter/next-match cycling was intentionally removed.
  // SVG diagrams have no meaningful spatial reading order (DOM order ≠ visual order)
  // so cycling through matches by Enter would jump to arbitrary canvas locations.
  // All matches are shown simultaneously — users navigate via pan/zoom.
  const handleKeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      clearSearch();
    }
  };
  addModalListener(searchInput, "keydown", handleKeydown);
}

/**
 * Reset module-level state for destroy/re-init cycles
 * Called by index.js destroy()
 */
export function resetSearch() {
  searchGeneration = 0;
  if (state.searchRafId) {
    cancelAnimationFrame(state.searchRafId);
    state.searchRafId = null;
  }
  // searchCache is a WeakMap — entries are GC'd automatically when the
  // clone SVG element is removed from DOM. No manual clear needed.
}
