/**
 * Search Module Tests
 * Tests for search candidate caching, performSearch, and clearSearch.
 */

import { jest } from "@jest/globals";
import { performSearch, clearSearch, resetSearch } from "../src/features/lazy/search.js";
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
    // All matches are shown simultaneously — no index-based navigation
    state.searchMatches.forEach((m) => {
      expect(m.classList.contains("dv-search-match")).toBe(true);
    });
  });

  test("clears matches when query is empty", () => {
    // Set some prior state
    state.searchMatches = [document.createElement("div")];

    performSearch(svg, "");

    expect(state.searchMatches.length).toBe(0);
  });

  test("clears matches when clone is null", () => {
    state.searchMatches = [document.createElement("div")];

    performSearch(null, "test");

    expect(state.searchMatches.length).toBe(0);
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
  });

  test("all matches get dv-search-match class (simultaneous highlight)", () => {
    performSearch(svg, "auth");
    flushRaf();

    expect(state.searchMatches.length).toBeGreaterThanOrEqual(1);
    // Every match must be highlighted — no single "current" concept
    state.searchMatches.forEach((el) => {
      expect(el.classList.contains("dv-search-match")).toBe(true);
    });
  });

  test("nested candidates count once: only the outermost .node matches", () => {
    // Mermaid flowchart markup: g.node > g.label > text
    const NS = "http://www.w3.org/2000/svg";
    const node = document.createElementNS(NS, "g");
    node.classList.add("node");
    const label = document.createElementNS(NS, "g");
    label.classList.add("label");
    const text = document.createElementNS(NS, "text");
    text.textContent = "Deploy Service";
    label.appendChild(text);
    node.appendChild(label);
    svg.appendChild(node);
    const status = document.createElement("div");
    status.id = "diagview-search-status";
    document.body.appendChild(status);

    performSearch(svg, "deploy");
    flushRaf();

    expect(state.searchMatches).toEqual([node]);
    expect(node.classList.contains("dv-search-match")).toBe(true);
    expect(label.classList.contains("dv-search-match")).toBe(false);
    expect(text.classList.contains("dv-search-match")).toBe(false);
    expect(status.textContent).toBe("1 match found");
  });

  test("whitespace-only query clears instead of matching everything", () => {
    const status = document.createElement("div");
    status.id = "diagview-search-status";
    status.textContent = "3 matches found";
    document.body.appendChild(status);
    performSearch(svg, "auth");
    flushRaf();
    expect(svg.querySelectorAll(".dv-search-match").length).toBe(1);

    performSearch(svg, "   ");
    flushRaf();

    expect(state.searchMatches).toEqual([]);
    expect(svg.querySelectorAll(".dv-search-match").length).toBe(0);
    expect(svg.classList.contains("dv-searching")).toBe(false);
    expect(status.textContent).toBe("");
  });

  test("clearing removes dv-search-match classes from previous matches", () => {
    performSearch(svg, "auth");
    flushRaf();
    const matched = svg.querySelectorAll(".dv-search-match");
    expect(matched.length).toBe(1);

    performSearch(svg, "");
    flushRaf();

    expect(svg.querySelectorAll(".dv-search-match").length).toBe(0);
    expect(state.searchMatches).toEqual([]);
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

    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb();
      return 1;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    state.searchMatches = [];
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

  test("resets searchMatches to empty array", () => {
    clearSearch();
    expect(state.searchMatches.length).toBe(0);
  });

  test("removes dv-searching class from SVG", () => {
    clearSearch();
    const svg = document.querySelector("#diagview-modal-viewport svg");
    expect(svg.classList.contains("dv-searching")).toBe(false);
  });

  test("removes dv-search-match classes from the highlighted elements", () => {
    const svg = document.querySelector("#diagview-modal-viewport svg");
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.classList.add("node", "dv-search-match");
    svg.appendChild(node);
    state.searchMatches = [node];

    clearSearch();

    expect(node.classList.contains("dv-search-match")).toBe(false);
    expect(state.searchMatches).toEqual([]);
  });
});

describe("Search: shapes behind plain SVG text", () => {
  const NS = "http://www.w3.org/2000/svg";
  let svg;
  let status;
  let rafCallbacks;
  // Current pan and zoom, applied to every mocked box
  let view;

  // jsdom has no layout, so each element reports a box in diagram units
  // that the current view moves and scales like pan and zoom would
  function place(el, x, y, w, h) {
    el.getBoundingClientRect = () => {
      // A 90 degree turn inside the 1000 x 1000 SVG moves (x, y) to (1000 - y, x).
      // The SVG itself keeps its box.
      const turn = view.angle === 90 && el !== svg;
      const [bx, by, bw, bh] = turn ? [1000 - (y + h), x, h, w] : [x, y, w, h];
      const left = view.x + bx * view.scale;
      const top = view.y + by * view.scale;
      const width = bw * view.scale;
      const height = bh * view.scale;
      return { left, top, width, height, right: left + width, bottom: top + height };
    };
    return el;
  }

  function add(tag, attrs = {}, parent = svg) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  }

  function flushRaf() {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }

  const marked = () => [...svg.querySelectorAll(".dv-search-match")];

  beforeEach(() => {
    resetConfig();
    resetSearch();
    view = { x: 0, y: 0, scale: 1, angle: 0 };
    document.body.innerHTML = "";
    svg = place(document.createElementNS(NS, "svg"), 0, 0, 1000, 1000);
    svg.getScreenCTM = () => ({ a: view.scale, d: view.scale, e: view.x, f: view.y });
    svg.getBBox = () => ({ x: 0, y: 0, width: 1000, height: 1000 });
    document.body.appendChild(svg);
    status = document.createElement("div");
    status.id = "diagview-search-status";
    document.body.appendChild(status);
    state.searchMatches = [];

    rafCallbacks = [];
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    jest
      .spyOn(window, "getComputedStyle")
      .mockImplementation((el) => ({ fill: el.getAttribute("fill") || "rgb(0, 0, 0)" }));
  });

  afterEach(() => {
    resetSearch();
    document.body.innerHTML = "";
    state.searchMatches = [];
    jest.restoreAllMocks();
  });

  // A hand-drawn diagram: a page backdrop, a panel holding a box with its
  // label, an edge line through the box, and a second box elsewhere
  function drawPlainDiagram() {
    const backdrop = place(add("rect"), 0, 0, 1000, 1000);
    const panel = place(add("rect"), 100, 100, 300, 300);
    const box = place(add("rect"), 150, 150, 200, 200);
    const edge = place(add("path", { fill: "none" }), 0, 240, 1000, 20);
    const label = place(add("text"), 200, 240, 100, 20);
    label.textContent = "Auth Service";
    const otherBox = place(add("circle"), 600, 600, 100, 100);
    const otherLabel = place(add("text"), 620, 640, 60, 20);
    otherLabel.textContent = "Billing";
    return { backdrop, panel, box, edge, label, otherBox, otherLabel };
  }

  test("a text match marks the smallest filled shape under it", () => {
    const { backdrop, panel, box, edge, label } = drawPlainDiagram();

    performSearch(svg, "auth");
    flushRaf();

    expect(label.classList.contains("dv-search-match")).toBe(true);
    expect(box.classList.contains("dv-search-match")).toBe(true);
    expect(panel.classList.contains("dv-search-match")).toBe(false);
    expect(backdrop.classList.contains("dv-search-match")).toBe(false);
    expect(edge.classList.contains("dv-search-match")).toBe(false);
  });

  test("the match count leaves the marked shape out", () => {
    const { box, label } = drawPlainDiagram();

    performSearch(svg, "auth");
    flushRaf();

    expect(state.searchMatches).toEqual([label]);
    expect(marked()).toEqual([box, label]);
    expect(status.textContent).toBe("1 match found");
  });

  test("the shape is unmarked when the query changes or clears", () => {
    const { box, label, otherBox, otherLabel } = drawPlainDiagram();

    performSearch(svg, "auth");
    flushRaf();
    performSearch(svg, "billing");
    flushRaf();

    expect(box.classList.contains("dv-search-match")).toBe(false);
    expect(label.classList.contains("dv-search-match")).toBe(false);
    expect(marked()).toEqual([otherBox, otherLabel]);

    performSearch(svg, "");
    expect(marked()).toEqual([]);

    performSearch(svg, "auth");
    flushRaf();
    document.body.innerHTML = `
      <input id="diagview-search" value="auth" />
      <div id="diagview-modal-viewport"></div>
    `;
    document.getElementById("diagview-modal-viewport").appendChild(svg);
    clearSearch();
    expect(marked()).toEqual([]);
  });

  test("shapes measured before a pan or zoom still pair with text after it", () => {
    const { box, label, otherBox, otherLabel } = drawPlainDiagram();

    performSearch(svg, "auth");
    flushRaf();
    expect(marked()).toEqual([box, label]);

    view = { x: -300, y: 120, scale: 2.5, angle: 0 };
    performSearch(svg, "billing");
    flushRaf();

    expect(marked()).toEqual([otherBox, otherLabel]);
  });

  test("shapes are measured again after the diagram is rotated", () => {
    const { box, label, otherBox, otherLabel } = drawPlainDiagram();

    performSearch(svg, "auth");
    flushRaf();
    expect(marked()).toEqual([box, label]);

    view.angle = 90;
    state.rotationAngle = 90;
    performSearch(svg, "billing");
    flushRaf();

    expect(marked()).toEqual([otherBox, otherLabel]);
  });

  // A wide Graphviz diagram in fullscreen: the SVG element is 1000 x 1000,
  // but its 1000 x 300 content is drawn in the strip from y = 350 to 650
  function drawWideDiagram() {
    svg.getBBox = () => ({ x: 0, y: 0, width: 1000, height: 300 });
    svg.getScreenCTM = () => ({
      a: view.scale,
      d: view.scale,
      e: view.x,
      f: view.y + 350 * view.scale,
    });
    const background = place(add("polygon", { fill: "white" }), 0, 350, 1000, 300);
    const box = place(add("polygon"), 100, 400, 200, 100);
    const label = place(add("text"), 150, 440, 100, 20);
    label.textContent = "AuthService";
    const edgeLabel = place(add("text"), 450, 480, 100, 20);
    edgeLabel.textContent = "lookup";
    return { background, box, label, edgeLabel };
  }

  test("an edge label in a wide diagram does not mark the background", () => {
    const { edgeLabel } = drawWideDiagram();

    performSearch(svg, "lookup");
    flushRaf();

    expect(marked()).toEqual([edgeLabel]);
  });

  test("a label in a wide diagram still marks its own box", () => {
    const { box, label } = drawWideDiagram();

    performSearch(svg, "authservice");
    flushRaf();
    expect(marked()).toEqual([box, label]);

    view = { x: -300, y: 120, scale: 2.5, angle: 0 };
    performSearch(svg, "lookup");
    flushRaf();
    performSearch(svg, "authservice");
    flushRaf();
    expect(marked()).toEqual([box, label]);
  });

  test("a Mermaid node match does not mark a shape of its own", () => {
    // g.node > rect + g.label > text: the node already holds its shape
    const node = add("g", { class: "node" });
    const shape = place(add("rect", {}, node), 100, 100, 200, 80);
    const label = add("g", { class: "label" }, node);
    const text = place(add("text", {}, label), 150, 130, 100, 20);
    text.textContent = "Deploy";

    performSearch(svg, "deploy");
    flushRaf();

    expect(state.searchMatches).toEqual([node]);
    expect(marked()).toEqual([node]);
    expect(shape.classList.contains("dv-search-match")).toBe(false);
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  // Graphviz and PlantUML shapes and text often have no class at all, and
  // Mermaid can repeat a class. Clearing must leave both as they were.
  function drawMixedDiagram() {
    svg.setAttribute("class", "flowchart flowchart dv-svg-content");
    drawPlainDiagram();
    const node = add("g", { class: "node default default", id: "flowchart-A-0" });
    place(add("rect", {}, node), 700, 100, 200, 80);
    add("text", {}, add("g", { class: "label" }, node)).textContent = "Auth Gateway";
  }

  test("clearing with an empty query restores the SVG markup exactly", () => {
    drawMixedDiagram();
    const before = svg.outerHTML;

    performSearch(svg, "auth");
    flushRaf();
    expect(marked().length).toBe(3);
    performSearch(svg, "billing");
    flushRaf();
    performSearch(svg, "");

    expect(svg.outerHTML).toBe(before);
  });

  test("clearSearch restores the SVG markup exactly", () => {
    drawMixedDiagram();
    document.body.innerHTML = `<div id="diagview-modal-viewport"></div>`;
    document.getElementById("diagview-modal-viewport").appendChild(svg);
    const before = svg.outerHTML;

    performSearch(svg, "a");
    flushRaf();
    clearSearch();

    expect(svg.outerHTML).toBe(before);
  });
});
