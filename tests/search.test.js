/**
 * Search Module Tests
 * Tests for search candidate caching, performSearch, and clearSearch.
 */

import { jest } from "@jest/globals";
import {
  performSearch,
  clearSearch,
  resetSearch,
  setupSearch,
} from "../src/features/lazy/search.js";
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

  test("spaces and line breaks count as one space in labels and query", () => {
    // Mermaid timelines draw an event as one text with tspans that keep the
    // source's runs of spaces
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.classList.add("node");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "First   release\n  of the app";
    node.appendChild(text);
    svg.appendChild(node);

    for (const query of ["first release", "First    release ", "release of"]) {
      performSearch(svg, query);
      flushRaf();
      expect(state.searchMatches).toEqual([node]);
    }
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

describe("Search: phrases across line breaks", () => {
  let svg;
  let status;
  let rafCallbacks;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"></svg>
      <div id="diagview-search-status"></div>`;
    svg = document.querySelector("svg");
    status = document.getElementById("diagview-search-status");
    state.searchMatches = [];
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

  function search(query) {
    performSearch(svg, query);
    rafCallbacks.splice(0).forEach((cb) => cb());
    return status.textContent;
  }

  test("a <br> in an HTML label counts as a space", () => {
    // Mermaid 11 and 12 flowchart node with "Firewall<br>UFW"
    svg.innerHTML = `<g class="node" id="fw"><rect></rect><g class="label"><foreignObject>
      <div><span class="nodeLabel"><p>Firewall<br>UFW</p></span></div>
      </foreignObject></g></g>`;
    const node = svg.querySelector("#fw");

    expect(search("firewall ufw")).toBe("1 match found");
    expect(state.searchMatches).toEqual([node]);
    expect(search("Firewall UFW")).toBe("1 match found");
    expect(search("firewall")).toBe("1 match found");
    expect(search("ufw")).toBe("1 match found");
    // The lines no longer run together
    expect(search("firewallufw")).toBe("No matches found");
  });

  test("block elements in an HTML label count as spaces, inline ones do not", () => {
    // draw.io writes each line of a label as a div
    svg.innerHTML = `<g class="label"><foreignObject><div>
      <div>Message</div><div>queue</div><ul><li>one</li><li>two</li></ul>
      <span>Hel</span><b>lo</b> <i>wor</i>ld</div></foreignObject></g>`;

    expect(search("message queue")).toBe("1 match found");
    expect(search("queue one two")).toBe("1 match found");
    expect(search("hello world")).toBe("1 match found");
  });

  test("Mermaid plain-SVG rows count as lines, a bold word in a row does not", () => {
    // flowchart with htmlLabels false: one tspan.row per line, words inside
    svg.innerHTML = `<g class="node"><g class="label"><text y="-10.1">
      <tspan class="text-outer-tspan row" x="0" y="-0.1em" dy="1.1em"><tspan class="text-inner-tspan">Firewall</tspan></tspan><tspan class="text-outer-tspan row" x="0" y="1em" dy="1.1em"><tspan class="text-inner-tspan">UFW</tspan></tspan>
      </text></g></g>
      <g class="node"><text><tspan class="text-outer-tspan row" x="0" y="-0.1em" dy="1.1em"><tspan class="text-inner-tspan">Hel</tspan><tspan class="text-inner-tspan" font-weight="bold">lo</tspan></tspan></text></g>`;

    expect(search("firewall ufw")).toBe("1 match found");
    expect(search("firewallufw")).toBe("No matches found");
    expect(search("hello")).toBe("1 match found");
    expect(search("hel lo")).toBe("No matches found");
  });

  test("a tspan with its own x and dy starts a line, one that only styles a word does not", () => {
    // Mermaid timeline event wrapped over lines, and hand-written markup
    svg.innerHTML = `<text><tspan x="0" dy="1em">A   rather   long   event</tspan><tspan x="0" dy="1.1em">text   that   wraps</tspan></text>
      <text>Hel<tspan font-weight="bold">lo</tspan></text>
      <text>E = mc<tspan dy="-5" font-size="8">2</tspan></text>
      <text><tspan x="10" y="20">Sp</tspan><tspan x="28" y="20" font-weight="bold">lit</tspan></text>
      <text><tspan x="10" y="40">Next</tspan><tspan x="10" y="56">line</tspan></text>`;

    expect(search("event text")).toBe("1 match found");
    expect(search("eventtext")).toBe("No matches found");
    expect(search("hello")).toBe("1 match found");
    expect(search("mc2")).toBe("1 match found");
    // Runs that share a y sit on one line
    expect(search("split")).toBe("1 match found");
    expect(search("next line")).toBe("1 match found");
  });

  test("a label drawn as one <text> per line matches across the lines and counts once", () => {
    // Mermaid sequence note "Firewall<br>UFW": one text per line in a group
    svg.innerHTML = `<g><rect class="note"></rect>
      <text x="175" y="149" class="noteText" text-anchor="middle" style="font-size: 16px">Firewall</text>
      <text x="175" y="166" class="noteText" text-anchor="middle" style="font-size: 16px">UFW</text></g>
      <text x="175" y="230" class="noteText" text-anchor="middle" style="font-size: 16px">Gateway</text>`;
    const [first, second, far] = svg.querySelectorAll("text");

    expect(search("firewall ufw")).toBe("1 match found");
    expect(state.searchMatches).toEqual([first, second]);
    // Either line keeps the whole label undimmed
    expect(search("ufw")).toBe("1 match found");
    expect(state.searchMatches).toEqual([first, second]);
    // A text further down is a label of its own
    expect(search("ufw gateway")).toBe("No matches found");
    expect(search("gateway")).toBe("1 match found");
    expect(state.searchMatches).toEqual([far]);
    search("");
    expect(svg.querySelectorAll(".dv-search-match").length).toBe(0);
  });

  test("texts at another x or with another class stay apart", () => {
    svg.innerHTML = `<text x="10" y="20" style="font-size: 16px">Name</text>
      <text x="50" y="36" style="font-size: 16px">Owner</text>
      <text x="50" y="52" class="a" style="font-size: 16px">Team</text>
      <text x="50" y="68" class="b" style="font-size: 16px">Lead</text>`;

    expect(search("name owner")).toBe("No matches found");
    expect(search("owner team")).toBe("No matches found");
    expect(search("team lead")).toBe("No matches found");
  });

  test("lines of a Graphviz node match across the break", () => {
    svg.innerHTML = `<g class="node"><title>fw</title><polygon></polygon>
      <text x="40" y="20">Firewall</text><text x="40" y="36">UFW</text></g>`;

    expect(search("firewall ufw")).toBe("1 match found");
    expect(state.searchMatches).toEqual([svg.querySelector(".node")]);
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

  // A draw.io label: a <switch> with the drawn HTML label in a
  // foreignObject the size of the diagram, then a <text> fallback
  function drawDrawioLabel(x, y, text, htmlClass) {
    const sw = add("switch", {}, add("g"));
    const fo = place(
      add(
        "foreignObject",
        { requiredFeatures: "http://www.w3.org/TR/SVG11/feature#Extensibility" },
        sw,
      ),
      0,
      0,
      1000,
      1000,
    );
    const outer = fo.appendChild(document.createElement("div"));
    const html = place(outer.appendChild(document.createElement("div")), x, y, 60, 14);
    html.textContent = text;
    if (htmlClass) html.className = htmlClass;
    const fallback = place(add("text", {}, sw), x, y, 60, 14);
    fallback.textContent = text;
    return { fo, html, fallback };
  }

  test("a draw.io label matches its drawn HTML and the box under it", () => {
    const box = place(add("rect", { fill: "#dae8fc" }), 100, 100, 120, 60);
    const queue = drawDrawioLabel(130, 123, "Queue");
    const other = place(add("rect", { fill: "#d5e8d4" }), 400, 100, 120, 60);
    drawDrawioLabel(430, 123, "Worker");
    const before = svg.outerHTML;

    performSearch(svg, "queue");
    flushRaf();

    expect(state.searchMatches).toEqual([queue.fo]);
    expect(marked()).toEqual([box, queue.fo]);
    expect(queue.fallback.classList.contains("dv-search-match")).toBe(false);
    expect(other.classList.contains("dv-search-match")).toBe(false);
    expect(status.textContent).toBe("1 match found");

    performSearch(svg, "");
    expect(svg.outerHTML).toBe(before);
  });

  test("a draw.io label whose HTML is a candidate too counts once", () => {
    const { html, fo } = drawDrawioLabel(130, 123, "Queue", "label");

    performSearch(svg, "queue");
    flushRaf();

    expect(state.searchMatches).toEqual([html]);
    expect(fo.classList.contains("dv-search-match")).toBe(false);
    expect(status.textContent).toBe("1 match found");
  });

  // An HTML label as Mermaid draws it: a foreignObject holding a div
  function addHtmlLabel(parent, x, y, text) {
    const fo = place(add("foreignObject", {}, parent), x, y, 80, 24);
    const div = place(fo.appendChild(document.createElement("div")), x, y, 80, 24);
    div.textContent = text;
    return fo;
  }

  test("a composite state title matches and marks the frame around the state", () => {
    // Mermaid state diagrams draw a composite state as an outer frame, an
    // inner box under the title, and the title in g.cluster-label, in a
    // group with no node or cluster class
    const group = add("g", { class: "statediagram-state statediagram-cluster" });
    const outer = place(add("rect", { class: "outer", fill: "#fff" }, group), 100, 100, 400, 300);
    const title = add("g", { class: "cluster-label" }, group);
    addHtmlLabel(title, 260, 103, "Running");
    const inner = place(add("rect", { class: "inner", fill: "#fff" }, group), 100, 130, 400, 270);

    performSearch(svg, "running");
    flushRaf();

    expect(state.searchMatches).toEqual([title]);
    expect(marked()).toEqual([outer, title]);
    expect(inner.classList.contains("dv-search-match")).toBe(false);
    expect(status.textContent).toBe("1 match found");
  });

  test("an HTML label in no searched group matches with the box under it", () => {
    // Mermaid event modeling: g.em-box > rect + foreignObject
    const group = add("g", { class: "em-box" });
    const box = place(add("rect", { fill: "#ffd8a8" }, group), 100, 100, 160, 80);
    const fo = addHtmlLabel(group, 140, 128, "Order placed");
    addHtmlLabel(add("g", { class: "em-box" }), 400, 128, "Order shipped");
    const drawn = svg.outerHTML;

    performSearch(svg, "placed");
    flushRaf();

    expect(state.searchMatches).toEqual([fo]);
    expect(marked()).toEqual([box, fo]);
    expect(status.textContent).toBe("1 match found");

    performSearch(svg, "");
    expect(svg.outerHTML).toBe(drawn);
  });

  test("an HTML label inside a node counts once", () => {
    const node = add("g", { class: "node" });
    place(add("rect", {}, node), 100, 100, 200, 80);
    const fo = addHtmlLabel(node, 150, 128, "Deploy");

    performSearch(svg, "deploy");
    flushRaf();

    expect(state.searchMatches).toEqual([node]);
    expect(fo.classList.contains("dv-search-match")).toBe(false);
  });

  test("an HTML label that holds a searched element counts once", () => {
    const fo = addHtmlLabel(add("g"), 150, 128, "");
    const span = fo.firstChild.appendChild(document.createElement("span"));
    span.className = "label";
    span.textContent = "Deploy";

    performSearch(svg, "deploy");
    flushRaf();

    expect(state.searchMatches).toEqual([span]);
    expect(fo.classList.contains("dv-search-match")).toBe(false);
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

describe("Search: bringing a match into view", () => {
  const NS = "http://www.w3.org/2000/svg";
  let svg;
  let input;
  let status;
  let rafCallbacks;
  // Screen offset of the diagram, moved by the mocked Panzoom
  let view;
  let pz;

  // jsdom has no layout, so each label reports a box the pan moves
  function label(text, x, y) {
    const t = document.createElementNS(NS, "text");
    t.textContent = text;
    t.getBoundingClientRect = () => {
      const left = view.x + x;
      const top = view.y + y;
      return { left, top, width: 60, height: 20, right: left + 60, bottom: top + 20 };
    };
    svg.appendChild(t);
    return t;
  }

  function flushRaf() {
    while (rafCallbacks.length) rafCallbacks.shift()();
  }

  function type(q) {
    input.value = q;
    input.dispatchEvent(new Event("input"));
    flushRaf();
  }

  function press(key, shiftKey = false) {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey }));
    flushRaf();
  }

  const current = () => [...svg.querySelectorAll(".dv-search-current")].map((e) => e.textContent);

  beforeEach(() => {
    resetConfig();
    resetSearch();
    view = { x: 0, y: 0 };
    document.body.innerHTML = `<input id="diagview-search" />
      <div id="diagview-modal-viewport"></div>
      <div id="diagview-search-status"></div>`;
    const viewport = document.getElementById("diagview-modal-viewport");
    viewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    });
    svg = viewport.appendChild(document.createElementNS(NS, "svg"));
    input = document.getElementById("diagview-search");
    status = document.getElementById("diagview-search-status");
    pz = {
      getScale: () => 4,
      getPan: () => ({ x: view.x / 4, y: view.y / 4 }),
      getOptions: () => ({ setTransform: () => {} }),
      zoom: jest.fn(),
      // A relative pan moves the diagram by the step times the scale
      pan: jest.fn((dx, dy) => {
        view.x += dx * 4;
        view.y += dy * 4;
      }),
    };
    state.activePanzoom = pz;
    rafCallbacks = [];
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    clearSearch();
    state.activePanzoom = null;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("a typed query pans the nearest match to the middle when none is in view", () => {
    label("Gateway east", 3000, 2000);
    label("Gateway west", 1500, 900);
    setupSearch(svg);

    type("gateway");

    expect(pz.pan).toHaveBeenCalledTimes(1);
    expect(pz.pan.mock.calls[0][2]).toMatchObject({ relative: true, animate: true });
    expect(pz.zoom).not.toHaveBeenCalled();
    // The middle of Gateway west now sits in the middle of the view
    expect(view).toEqual({ x: -1500 + 400 - 30, y: -900 + 300 - 10 });
    expect(current()).toEqual(["Gateway west"]);
    expect(status.textContent).toBe("2 matches found");
  });

  test("a label drawn as one text per line pans to the middle of all its lines", () => {
    for (const [text, y] of [
      ["Gateway", 2000],
      ["east", 2020],
    ]) {
      const t = label(text, 3000, y);
      t.setAttribute("x", "3000");
      t.setAttribute("y", String(y));
    }
    setupSearch(svg);

    type("gateway east");

    expect(status.textContent).toBe("1 match found");
    expect(view).toEqual({ x: -3030 + 400, y: -2020 + 300 });
    expect(current()).toEqual(["Gateway", "east"]);
  });

  test("a large group pans to its title, not the middle of its frame", () => {
    const group = svg.appendChild(document.createElementNS(NS, "g"));
    group.setAttribute("class", "cluster");
    const frame = group.appendChild(document.createElementNS(NS, "rect"));
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, right: 5000, bottom: 5000 });
    group.appendChild(label("Backend", 3000, 2000));
    setupSearch(svg);

    type("backend");

    expect(view).toEqual({ x: -3030 + 400, y: -2010 + 300 });
  });

  test("a typed query with a match in view leaves the view alone", () => {
    label("Gateway east", 3000, 2000);
    label("Gateway west", 100, 100);
    setupSearch(svg);

    type("gateway");

    expect(pz.pan).not.toHaveBeenCalled();
    expect(current()).toEqual([]);
  });

  test("a query given on open keeps the view it opened with", () => {
    label("Gateway east", 3000, 2000);
    setupSearch(svg, "gateway");
    flushRaf();

    expect(status.textContent).toBe("1 match found");
    expect(pz.pan).not.toHaveBeenCalled();
  });

  test("Enter and Shift+Enter step through matches in reading order, not markup order", () => {
    label("Node C", 100, 300);
    label("Node B", 500, 100);
    label("Node A", 100, 105);
    setupSearch(svg);
    type("node");

    const steps = [];
    for (const shift of [false, false, false, false, true, true]) {
      press("Enter", shift);
      steps.push(`${current()[0]} ${status.textContent}`);
    }

    expect(steps).toEqual([
      "Node A Match 1 of 3",
      "Node B Match 2 of 3",
      "Node C Match 3 of 3",
      "Node A Match 1 of 3",
      "Node C Match 3 of 3",
      "Node B Match 2 of 3",
    ]);
    // Every match was in view
    expect(pz.pan).not.toHaveBeenCalled();
  });

  test("Enter pans to the next match when it is out of view", () => {
    label("Node A", 100, 100);
    label("Node B", 2000, 100);
    setupSearch(svg);
    type("node");

    press("Enter");
    expect(pz.pan).not.toHaveBeenCalled();
    press("Enter");

    expect(current()).toEqual(["Node B"]);
    expect(pz.pan).toHaveBeenCalledTimes(1);
    expect(view).toEqual({ x: -2000 + 400 - 30, y: -100 + 300 - 10 });
  });

  test("Enter right after typing steps through the query in the box", () => {
    label("Node A", 100, 100);
    label("Node B", 300, 100);
    setupSearch(svg);
    type("node");
    // Typed within the throttle, so this search still waits
    type("node b");
    expect(status.textContent).toBe("2 matches found");

    press("Enter");

    expect(current()).toEqual(["Node B"]);
    expect(status.textContent).toBe("Match 1 of 1");
  });

  test("clearing after Enter restores the SVG markup exactly", () => {
    label("Node A", 100, 100);
    label("Node B", 300, 100);
    setupSearch(svg);
    // Panzoom owns the style of the SVG itself, so compare what is inside
    const before = svg.innerHTML;
    type("node");
    press("Enter");
    press("Enter");
    expect(current()).toEqual(["Node B"]);

    clearSearch();

    expect(svg.innerHTML).toBe(before);
  });
});

describe("Search: a query given on open", () => {
  let hadMatchMedia;

  function build() {
    document.body.innerHTML = `
      <div class="diagview-topbar">
        <button id="dv-search-icon-btn" aria-expanded="false"></button>
        <input id="diagview-search" />
        <button id="diagview-search-clear"></button>
      </div>
      <div id="diagview-modal-viewport"></div>
    `;
    const svg = createMockSvg();
    document.getElementById("diagview-modal-viewport").appendChild(svg);
    return svg;
  }

  function phone(matches) {
    window.matchMedia = jest.fn((q) => ({ matches: matches && q === "(max-width: 639px)" }));
  }

  beforeEach(() => {
    resetConfig();
    hadMatchMedia = "matchMedia" in window;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    if (!hadMatchMedia) delete window.matchMedia;
    document.body.innerHTML = "";
    state.searchMatches = [];
    jest.restoreAllMocks();
  });

  test("opens the phone search bar so the query shows, without focusing it", () => {
    phone(true);
    const svg = build();
    const input = document.getElementById("diagview-search");
    const btn = document.getElementById("dv-search-icon-btn");

    setupSearch(svg, "data");

    expect(input.value).toBe("data");
    expect(document.querySelector(".diagview-topbar").classList.contains("search-open")).toBe(true);
    expect(btn.classList.contains("active")).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).not.toBe(input);
  });

  test("leaves the bar folded with no query", () => {
    phone(true);
    setupSearch(build(), "");

    expect(document.querySelector(".diagview-topbar").classList.contains("search-open")).toBe(
      false,
    );
    expect(document.getElementById("dv-search-icon-btn").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("leaves the desktop topbar alone", () => {
    phone(false);
    setupSearch(build(), "data");

    expect(document.getElementById("diagview-search").value).toBe("data");
    expect(document.querySelector(".diagview-topbar").classList.contains("search-open")).toBe(
      false,
    );
    expect(document.getElementById("dv-search-icon-btn").classList.contains("active")).toBe(false);
  });
});
