/**
 * DiagView Search Functionality
 * Optimized for performance: Caching + Batching + Dirty Checking
 * @module features/lazy/search
 */

import { state } from "../../core/config.js";
import { TIMING, SELECTORS } from "../../core/constants.js";
import { throttle, getClientCTM, drawnChild, undrawnSwitch } from "../../core/utils.js";
import { addModalListener } from "../../core/lifecycle.js";

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
 * Shapes marked for plain-SVG text matches. They are not search candidates,
 * so the candidate loop cannot unmark them.
 * @type {Element[]}
 */
let markedShapes = [];

/**
 * Class attributes as they were before search marked each element (null
 * when there was none). Clearing puts the exact value back, so no empty
 * class="" is left and duplicate classes survive.
 * @type {Map<Element, string|null>}
 */
let savedClass = new Map();

function mark(el, cls) {
  if (!savedClass.has(el)) savedClass.set(el, el.getAttribute("class"));
  el.classList.add(cls);
}

function unmark(el, cls) {
  const prev = savedClass.get(el);
  if (prev === undefined) return el.classList.remove(cls);
  savedClass.delete(el);
  if (prev === null) el.removeAttribute("class");
  else el.setAttribute("class", prev);
}

/**
 * Initialize or retrieve search cache
 * O(N) read operation, done once per diagram instance (or refresh)
 */
function getSearchCandidates(clone) {
  if (state.searchCache.has(clone)) {
    return state.searchCache.get(clone);
  }

  // Use centralized selector constant
  const sel = SELECTORS.SEARCH_NODES;
  const elements = clone.querySelectorAll(sel);
  const cache = [];
  const seen = new Set();

  for (let i = 0; i < elements.length; i++) {
    let el = elements[i];
    // Mermaid nests g.node > g.label > text. An ancestor candidate's text
    // contains the descendant's, so it always matches too — keep only the
    // outermost candidate or one node reports "3 matches found".
    const outer = el.parentElement?.closest(sel);
    if (outer && outer !== clone && clone.contains(outer)) continue;
    // draw.io draws each label as HTML in a <switch> and never the <text>
    // fallback next to it. Match the drawn child in its place, once, unless
    // it holds a candidate of its own.
    const sw = undrawnSwitch(el);
    if (sw) {
      el = drawnChild(sw);
      if (!el || seen.has(el) || el.matches(sel) || el.querySelector(sel)) continue;
      seen.add(el);
    }
    cache.push({
      el: el,
      text: (el.textContent || "").toLowerCase(),
      // What to measure for the shape under a plain-SVG label
      box: el.localName === "text" ? el : sw && labelBox(el),
    });
  }

  state.searchCache.set(clone, cache);
  return cache;
}

const SHAPE_SELECTOR = "rect, circle, ellipse, polygon, path";

/**
 * The element that holds the text of a drawn switch child. draw.io wraps
 * its label in a foreignObject the size of the whole diagram and a few
 * layout divs, so step down while there is a single child and no text.
 */
function labelBox(el) {
  while (
    el.children.length === 1 &&
    ![...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim())
  ) {
    el = el.firstElementChild;
  }
  return el;
}

/**
 * Box of an element in the SVG's own units, through its client matrix m.
 * Pan and zoom move the SVG and everything in it together, so these stay
 * valid after the user pans or zooms between two searches.
 */
function relativeBox(el, m) {
  const r = el.getBoundingClientRect();
  return {
    left: (r.left - m.e) / m.a,
    top: (r.top - m.f) / m.d,
    right: (r.right - m.e) / m.a,
    bottom: (r.bottom - m.f) / m.d,
  };
}

function size(r) {
  return (r.right - r.left) * (r.bottom - r.top);
}

/**
 * Filled shapes of a plain SVG with their boxes, measured once per diagram
 * and rotation. Rotation turns the content inside the SVG, so boxes from
 * another angle no longer line up. Edges have no fill, so they never count
 * as a label's shape.
 */
function getShapeBoxes(clone, m) {
  const cached = state.searchShapeCache.get(clone);
  if (cached && cached.angle === state.rotationAngle) return cached.boxes;
  const boxes = [];
  // Compare with the drawn content, not the SVG element. In fullscreen a
  // wide diagram fills only a strip of the element, so its backdrop would
  // look small next to the element's box.
  const ink = clone.getBBox();
  for (const el of clone.querySelectorAll(SHAPE_SELECTOR)) {
    if (el.closest("defs, marker, clipPath, mask, pattern")) continue;
    if (getComputedStyle(el).fill === "none") continue;
    const r = relativeBox(el, m);
    const area = size(r);
    // A backdrop covering most of the diagram is not a label's shape
    if (!area || area * 2 > ink.width * ink.height) continue;
    boxes.push({ el, r, area });
  }
  state.searchShapeCache.set(clone, { angle: state.rotationAngle, boxes });
  return boxes;
}

/**
 * A plain SVG draws a label as a <text> next to its shape, not inside it,
 * and draw.io does the same with its HTML labels. Return the smallest
 * filled shape under the label's centre, so the match can outline it and
 * keep it undimmed. Mermaid nodes never get here: their outermost candidate
 * is the group that already holds the shape.
 */
function findShapeForText(clone, item) {
  if (item.shape !== undefined) return item.shape;
  if (!item.box) {
    item.shape = null;
    return null;
  }
  // Not laid out yet: measure on a later search instead of caching a miss
  // Client pixels, like getBoundingClientRect (see getClientCTM)
  const m = getClientCTM(clone);
  const t = m && relativeBox(item.box, m);
  if (!t || !size(t)) return null;
  item.shape = null;
  const cx = (t.left + t.right) / 2;
  const cy = (t.top + t.bottom) / 2;
  let best = Infinity;
  for (const b of getShapeBoxes(clone, m)) {
    if (b.area < best && cx >= b.r.left && cx <= b.r.right && cy >= b.r.top && cy <= b.r.bottom) {
      item.shape = b.el;
      best = b.area;
    }
  }
  return item.shape;
}

/**
 * Clear all search highlights
 */
function clearHighlights(clone) {
  if (!clone) return;

  // A pending search frame has not applied its classes yet — drop it
  if (state.searchRafId) {
    cancelAnimationFrame(state.searchRafId);
    state.searchRafId = null;
  }

  // CRIT-5: Use cached matches instead of expensive querySelectorAll
  // This is O(k) instead of O(n), dramatically faster for large SVGs.
  // Remove synchronously: callers reset state.searchMatches right after
  // this call, and the clear button fires clearSearch() and handleClear()
  // back to back, so a deferred frame would either see an empty list or be
  // cancelled by the second call before it runs.
  const toClean = state.searchMatches;
  state.searchMatches = []; // EVT-2: Clear state matches
  for (let i = 0; i < toClean.length; i++) {
    unmark(toClean[i], "dv-search-match");
  }
  for (const el of markedShapes) unmark(el, "dv-search-match");
  markedShapes = [];

  const statusEl = document.getElementById("diagview-search-status");
  if (statusEl) statusEl.textContent = "";
}

/**
 * Perform search on diagram
 */
export function performSearch(clone, query) {
  const gen = ++searchGeneration;
  if (state.searchRafId) cancelAnimationFrame(state.searchRafId);

  // If query is empty (or whitespace only), clear everything immediately
  const lq = (query || "").toLowerCase().trim();
  if (!lq || !clone) {
    if (clone) {
      clearHighlights(clone);
      unmark(clone, "dv-searching");
    }
    state.searchMatches = [];
    return;
  }

  const candidates = getSearchCandidates(clone); // O(1) retrieval
  const newMatches = [];

  // Batch DOM updates in next frame
  state.searchRafId = requestAnimationFrame(() => {
    state.searchRafId = null;
    if (gen !== searchGeneration) return;
    mark(clone, "dv-searching");

    const shapes = new Set();

    // Single loop for O(1) DOM updates utilizing CSS fading architecture
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const isMatch = item.text.includes(lq);
      const isSearchMatch = item.el.classList.contains("dv-search-match");

      if (isMatch) {
        if (!isSearchMatch) mark(item.el, "dv-search-match");
        newMatches.push(item.el);
        const shape = findShapeForText(clone, item);
        if (shape) shapes.add(shape);
      } else {
        if (isSearchMatch) unmark(item.el, "dv-search-match");
      }
    }

    for (const el of markedShapes) {
      if (!shapes.has(el)) unmark(el, "dv-search-match");
    }
    for (const el of shapes) mark(el, "dv-search-match");
    markedShapes = [...shapes];

    state.searchMatches = newMatches;

    // Announce match count to screen readers via aria-live region (B3)
    const statusEl = document.getElementById("diagview-search-status");
    if (statusEl) {
      statusEl.textContent =
        newMatches.length > 0
          ? `${newMatches.length} match${newMatches.length === 1 ? "" : "es"} found`
          : "No matches found";
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
    unmark(clone, "dv-searching");
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
    // The phone search bar starts folded, which hid a query from a share
    // link or openFullscreen(). Unfold it, but leave focus alone so no
    // keyboard pops up.
    if (window.matchMedia?.("(max-width: 639px)").matches) {
      const btn = document.getElementById("dv-search-icon-btn");
      document.querySelector(".diagview-topbar")?.classList.add("search-open");
      btn?.classList.add("active");
      btn?.setAttribute("aria-expanded", "true");
    }
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
  markedShapes = [];
  savedClass = new Map();
  if (state.searchRafId) {
    cancelAnimationFrame(state.searchRafId);
    state.searchRafId = null;
  }
  // searchCache and searchShapeCache are WeakMaps. Their entries are GC'd
  // automatically when the clone SVG element is removed from DOM, so no
  // manual clear is needed.
}
