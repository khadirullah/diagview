/**
 * Search Module Tests
 * Tests for search candidate caching, performSearch, and clearSearch.
 */

import { jest } from "@jest/globals";
import { performSearch, clearSearch } from "../src/features/lazy/search.js";
import { state, resetConfig } from "../src/core/config.js";

// Mock SVG with searchable nodes
function createMockSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  const node1 = document.createElementNS("http://www.w3.org/2000/svg", "g");
  node1.classList.add("node");
  const text1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text1.textContent = "Authentication Service";
  node1.appendChild(text1);

  const node2 = document.createElementNS("http://www.w3.org/2000/svg", "g");
  node2.classList.add("node");
  const text2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text2.textContent = "Database Handler";
  node2.appendChild(text2);

  const node3 = document.createElementNS("http://www.w3.org/2000/svg", "g");
  node3.classList.add("node");
  const text3 = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text3.textContent = "API Gateway";
  node3.appendChild(text3);

  const edge = document.createElementNS("http://www.w3.org/2000/svg", "g");
  edge.classList.add("edgePath");

  svg.appendChild(node1);
  svg.appendChild(node2);
  svg.appendChild(node3);
  svg.appendChild(edge);

  return svg;
}

describe("Search: performSearch", () => {
  let svg;
  let rafCallbacks;

  beforeEach(() => {
    resetConfig();
    svg = createMockSvg();
    document.body.innerHTML = "";
    document.body.appendChild(svg);

    // Create counter element that performSearch looks for
    const cnt = document.createElement("span");
    cnt.className = "dv-src-cnt";
    document.body.appendChild(cnt);

    state.searchMatches = [];
    state.searchIndex = -1;

    // Capture requestAnimationFrame callbacks for manual flushing
    rafCallbacks = [];
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    state.searchMatches = [];
    state.searchIndex = -1;
    jest.restoreAllMocks();
  });

  function flushRaf() {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }

  test("finds matching nodes by text content", () => {
    performSearch(svg, "auth");
    flushRaf();

    expect(state.searchMatches.length).toBeGreaterThanOrEqual(1);
    expect(state.searchIndex).toBe(0);
  });

  test("clears matches when query is empty", () => {
    // Set some prior state
    state.searchMatches = [document.createElement("div")];
    state.searchIndex = 0;

    performSearch(svg, "");

    expect(state.searchMatches.length).toBe(0);
    expect(state.searchIndex).toBe(-1);
  });

  test("clears matches when clone is null", () => {
    state.searchMatches = [document.createElement("div")];
    state.searchIndex = 0;

    performSearch(null, "test");

    expect(state.searchMatches.length).toBe(0);
    expect(state.searchIndex).toBe(-1);
  });

  test("case-insensitive matching", () => {
    performSearch(svg, "DATABASE");
    flushRaf();

    expect(state.searchMatches.length).toBeGreaterThanOrEqual(1);
  });

  test("adds dv-searching class to clone during search", () => {
    performSearch(svg, "api");
    flushRaf();

    expect(svg.classList.contains("dv-searching")).toBe(true);
  });

  test("removes dv-searching class when clearing search", () => {
    svg.classList.add("dv-searching");

    performSearch(svg, "");

    expect(svg.classList.contains("dv-searching")).toBe(false);
  });

  test("returns no matches for non-existent query", () => {
    performSearch(svg, "zzz_nonexistent_zzz");
    flushRaf();

    expect(state.searchMatches.length).toBe(0);
    expect(state.searchIndex).toBe(-1);
  });

  test("highlights current match with dv-cur class", () => {
    performSearch(svg, "auth");
    flushRaf();

    expect(state.searchMatches.length).toBeGreaterThanOrEqual(1);
    const current = state.searchMatches[state.searchIndex];
    expect(current.classList.contains("dv-cur")).toBe(true);
  });
});

describe("Search: clearSearch", () => {
  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = `
      <input id="diagview-search" value="test query" />
      <button id="diagview-search-clear" class="show"></button>
      <div id="diagview-modal-viewport">
        <svg class="dv-searching"></svg>
      </div>
      <span class="dv-src-cnt show">1/3</span>
    `;
    state.searchMatches = [document.createElement("div")];
    state.searchIndex = 0;

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb();
      return 1;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    state.searchMatches = [];
    state.searchIndex = -1;
    jest.restoreAllMocks();
  });

  test("clears search input value", () => {
    clearSearch();
    expect(document.getElementById("diagview-search").value).toBe("");
  });

  test("hides clear button", () => {
    clearSearch();
    expect(document.getElementById("diagview-search-clear").classList.contains("show")).toBe(false);
  });

  test("resets search state", () => {
    clearSearch();
    expect(state.searchMatches.length).toBe(0);
    expect(state.searchIndex).toBe(-1);
  });

  test("removes dv-searching class from SVG", () => {
    clearSearch();
    const svg = document.querySelector("#diagview-modal-viewport svg");
    expect(svg.classList.contains("dv-searching")).toBe(false);
  });
});
