/**
 * DiagView Search Functionality
 * Optimized for performance: Caching + Batching + Dirty Checking
 * @module features/lazy/search
 */

import { state } from "../../core/config.js";
import { TIMING, SELECTORS } from "../../core/constants.js";
import { throttle } from "../../core/utils.js";

// searchCache is keyed on the cloned SVG element (the modal clone).
// When the modal closes, viewport.innerHTML = "" destroys the clone,
// the WeakMap entry becomes GC-eligible, and the next modal open
// gets a fresh cache automatically. This is intentional.
const searchCache = new WeakMap();

/**
 * Initialize or retrieve search cache
 * O(N) read operation, done once per diagram instance (or refresh)
 */
function getSearchCandidates(clone) {
  if (searchCache.has(clone)) {
    return searchCache.get(clone);
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

  searchCache.set(clone, cache);
  return cache;
}

/**
 * Clear all search highlights
 */
function clearHighlights(clone) {
  if (!clone) return;

  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);

  state.searchRafId = requestAnimationFrame(() => {
    // Only touch nodes that actively have our search classes
    const activeNodes = clone.querySelectorAll(".dv-search-match, .dv-cur");
    for (let i = 0; i < activeNodes.length; i++) {
      activeNodes[i].classList.remove("dv-search-match", "dv-cur");
    }
    state.searchRafId = null;
  });
}

/**
 * Highlight current match
 */
function highlightCurrentMatch() {
  const el = state.searchMatches[state.searchIndex];
  if (!el) return;

  // Remove previous current highlight
  state.searchMatches.forEach((match) => match.classList.remove("dv-cur"));

  // Add current highlight
  el.classList.add("dv-cur");
}

/**
 * Perform search on diagram
 */
export function performSearch(clone, query) {
  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);

  // If query is empty, clear everything immediately
  if (!query || !clone) {
    if (clone) {
      clearHighlights(clone);
      clone.classList.remove("dv-searching");
    }
    state.searchMatches = [];
    state.searchIndex = -1;
    return;
  }

  const lq = query.toLowerCase().trim();
  const candidates = getSearchCandidates(clone); // O(1) retrieval
  const newMatches = [];

  // Batch DOM updates in next frame
  state.searchRafId = requestAnimationFrame(() => {
    clone.classList.add("dv-searching");

    // Single loop for O(1) DOM updates utilizing CSS fading architecture
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const isMatch = item.text.includes(lq);
      const isCur = item.el.classList.contains("dv-cur");
      const isSearchMatch = item.el.classList.contains("dv-search-match");

      // Explicitly clear .dv-cur from all nodes to prevent stale highlights
      if (isCur) {
        item.el.classList.remove("dv-cur");
      }

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

    // If matches found, select the first one
    if (state.searchMatches.length > 0) {
      state.searchIndex = 0;
      highlightCurrentMatch();
    } else {
      state.searchIndex = -1;
    }
  });
}

/**
 * Clear search
 */
export function clearSearch() {
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
  state.searchIndex = -1;
}

/**
 * Setup search functionality
 */
export function setupSearch(clone, initialQuery = "") {
  const searchInput = document.getElementById("diagview-search");
  const searchClear = document.getElementById("diagview-search-clear");

  if (!searchInput) return;

  // Pre-warm cache
  getSearchCandidates(clone);

  // Reset search state (or apply initial query)
  searchInput.value = initialQuery || "";
  if (searchClear) {
    searchClear.classList.toggle("show", !!initialQuery);
  }

  if (initialQuery) {
    // Perform initial search immediately
    performSearch(clone, initialQuery);
  }

  state.searchMatches = [];
  state.searchIndex = -1;

  // Throttled search using centralized constant
  const performSearchThrottled = throttle((query) => {
    performSearch(clone, query);
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
      performSearch(clone, "");
    } else {
      performSearchThrottled(query);
    }
  };

  searchInput.addEventListener("input", handleInput);

  // Clear button handler
  if (searchClear) {
    const handleClear = () => {
      searchInput.value = "";
      searchClear.classList.remove("show");
      searchInput.focus();
      performSearch(clone, "");
    };
    searchClear.addEventListener("click", handleClear);
  }

  // Keyboard navigation
  const handleKeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // "Next Match" behavior on Enter is currently disabled
    } else if (e.key === "Escape") {
      e.stopPropagation();
      clearSearch();
    }
  };
  searchInput.addEventListener("keydown", handleKeydown);
}

/**
 * Reset module-level state for destroy/re-init cycles
 * Called by index.js destroy()
 */
export function resetSearch() {
  if (state.searchRafId) {
    cancelAnimationFrame(state.searchRafId);
    state.searchRafId = null;
  }
  // searchCache is a WeakMap — entries are GC'd automatically when the
  // clone SVG element is removed from DOM. No manual clear needed.
}
