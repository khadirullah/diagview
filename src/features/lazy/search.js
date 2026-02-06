/**
 * DiagView Search Functionality
 * Optimized for performance: Caching + Batching + Dirty Checking
 * @module features/lazy/search
 */

import { state } from "../../core/config.js";
import { TIMING, SELECTORS } from "../../core/constants.js";
import { throttle, raf, cancelRaf } from "../../core/utils.js";

// Cache for search candidates to avoid repeated DOM reads
// Map<SVGElement, Array<{el: Element, text: string, isPath: boolean}>>
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
      text: (el.textContent || '').toLowerCase(),
      isPath: el.classList.contains("edgePath")
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

  // Clear classes and inline styles
  // We use the cache if available for faster iteration, otherwise query selector
  const cache = searchCache.get(clone);

  if (cache) {
    requestAnimationFrame(() => {
      for (let i = 0; i < cache.length; i++) {
        const item = cache[i];
        // Dirty check before strict clearing
        if (item.el.style.opacity !== "") item.el.style.opacity = "";
        if (item.el.style.pointerEvents !== "") item.el.style.pointerEvents = "";
        if (item.el.classList.contains("dv-search-match")) item.el.classList.remove("dv-search-match");
        if (item.el.classList.contains("dv-cur")) item.el.classList.remove("dv-cur");
      }
    });
  } else {
    // Fallback if no cache
    clone.querySelectorAll(".dv-search-match, .dv-cur").forEach((el) => {
      el.classList.remove("dv-search-match", "dv-cur");
      el.style.opacity = "";
      el.style.pointerEvents = "";
    });
    if (clone.classList.contains("dv-searching")) {
      clone.querySelectorAll(SELECTORS.SEARCH_NODES).forEach(el => {
        el.style.opacity = "";
        el.style.pointerEvents = "";
      });
    }
  }
}

/**
 * Update search counter display
 */
function updateSearchCounter(searchCnt) {
  if (!searchCnt) return;

  const hasMatches = state.searchMatches.length > 0;
  searchCnt.textContent = hasMatches
    ? `${state.searchIndex + 1}/${state.searchMatches.length}`
    : "";
  searchCnt.classList.toggle("show", hasMatches);
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

let searchRafId = null;

/**
 * Perform search on diagram
 */
export function performSearch(clone, query) {
  if (searchRafId) cancelRaf(searchRafId);

  // If query is empty, clear everything immediately
  if (!query || !clone) {
    clearHighlights(clone);
    clone.classList.remove('dv-searching');
    state.searchMatches = [];
    state.searchIndex = -1;
    updateSearchCounter(document.querySelector(".dv-src-cnt"));
    return;
  }

  const lq = query.toLowerCase().trim();
  const candidates = getSearchCandidates(clone); // O(1) retrieval
  const newMatches = [];

  // Batch DOM updates in next frame
  searchRafId = raf(() => {
    clone.classList.add('dv-searching');

    // Single loop for calculation AND update (since we have cached reads)
    // Writing styles to 2500 elements is still heavy, but checking first helps.
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const isMatch = item.text.includes(lq);

      // Edges stay visible if there is a query, even if they don't match text directly
      const isVisible = isMatch || (item.isPath && lq !== "");

      const targetOpacity = isVisible ? "1" : "0.15";
      const targetPointer = isMatch ? "auto" : "none";

      // Dirty Checking: Only touch DOM if changed
      if (item.el.style.opacity !== targetOpacity) {
        item.el.style.opacity = targetOpacity;
      }

      if (item.el.style.pointerEvents !== targetPointer) {
        item.el.style.pointerEvents = targetPointer;
      }

      // Explicitly clear .dv-cur from all nodes to prevent stale highlights
      if (item.el.classList.contains("dv-cur")) {
        item.el.classList.remove("dv-cur");
      }

      if (isMatch) {
        if (!item.el.classList.contains('dv-search-match')) {
          item.el.classList.add('dv-search-match');
        }
        newMatches.push(item.el);
      } else {
        if (item.el.classList.contains('dv-search-match')) {
          item.el.classList.remove('dv-search-match');
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

    updateSearchCounter(document.querySelector(".dv-src-cnt"));
  });
}

/**
 * Clear search
 */
export function clearSearch() {
  if (searchRafId) cancelRaf(searchRafId);

  const searchInput = document.getElementById("diagview-search");
  const searchClear = document.getElementById("diagview-search-clear");

  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.classList.remove("show");

  const viewport = document.getElementById("diagview-modal-viewport");
  const clone = viewport?.querySelector("svg");

  if (clone) {
    clone.classList.remove('dv-searching');
    clearHighlights(clone);
  }

  state.searchMatches = [];
  state.searchIndex = -1;
  updateSearchCounter(document.querySelector(".dv-src-cnt"));
}

/**
 * Setup search functionality
 */
export function setupSearch(clone) {
  const searchInput = document.getElementById("diagview-search");
  const searchClear = document.getElementById("diagview-search-clear");

  if (!searchInput) return;

  // Pre-warm cache
  getSearchCandidates(clone);

  // Reset search state
  searchInput.value = "";
  if (searchClear) searchClear.classList.remove("show");
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
    performSearchThrottled(query);
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
