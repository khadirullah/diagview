/**
 * Observer Integration Tests
 * Tests for MutationObserver detection and automatic diagram initialization.
 */

import { jest } from "@jest/globals";

// 1. Define mocks FIRST
jest.unstable_mockModule("../src/features/diagram-init.js", () => ({
  initializeDiagram: jest.fn((el) => {
    el.dataset.diagviewInit = "true";
  }),
  deinitializeDiagram: jest.fn(),
  recoverErrorDiagram: jest.fn(() => false),
}));

jest.unstable_mockModule("../src/ui/modal.js", () => ({
  createModal: jest.fn(),
  openFullscreen: jest.fn(),
  closeModal: jest.fn(),
}));

jest.unstable_mockModule("../src/features/lazy/share.js", () => ({
  restoreViewFromURL: jest.fn(() => null),
}));

// 2. Import modules AFTER mocks are defined
const { state, resetConfig, updateConfig } = await import("../src/core/config.js");
const { observeDiagrams, stopObserving, refreshDiagrams, resetShareLinkCheck } =
  await import("../src/core/observer.js");
const { initializeDiagram, deinitializeDiagram } = await import("../src/features/diagram-init.js");
const { openFullscreen } = await import("../src/ui/modal.js");

describe("Observer Module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetConfig();
    state.observer = null;
    updateConfig({ diagramSelector: ".diagram" });
    jest.clearAllMocks();
  });

  afterEach(() => {
    stopObserving();
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test("observeDiagrams initializes existing diagrams immediately", () => {
    const div = document.createElement("div");
    div.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svg);
    document.body.appendChild(div);

    observeDiagrams();

    expect(initializeDiagram).toHaveBeenCalledWith(div, 0);
    expect(div.dataset.diagviewInit).toBe("true");
  });

  test("MutationObserver detects newly added diagrams after debounce", async () => {
    observeDiagrams();

    const div = document.createElement("div");
    div.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svg);

    document.body.appendChild(div);

    // Wait for MutationObserver (microtask) + Observer debounce (100ms)
    await wait(200);

    expect(initializeDiagram).toHaveBeenCalledWith(div, 0);
  });

  test("MutationObserver handles nested diagrams", async () => {
    observeDiagrams();

    const container = document.createElement("div");
    const nested = document.createElement("div");
    nested.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    nested.appendChild(svg);
    container.appendChild(nested);
    document.body.appendChild(container);

    await wait(200);

    expect(initializeDiagram).toHaveBeenCalledWith(nested, 0);
  });

  test("an SVG arriving later inside an existing empty container initializes it", async () => {
    const div = document.createElement("div");
    div.className = "diagram";
    document.body.appendChild(div);

    observeDiagrams();
    expect(initializeDiagram).not.toHaveBeenCalled(); // no SVG yet

    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

    await wait(200);

    expect(initializeDiagram).toHaveBeenCalledWith(div, 0);
  });

  test("stopObserving disconnects the observer", () => {
    observeDiagrams();
    const observer = state.observer;
    const disconnectSpy = jest.spyOn(observer, "disconnect");

    stopObserving();

    expect(disconnectSpy).toHaveBeenCalled();
    expect(state.observer).toBeNull();
  });

  test("refreshDiagrams manually triggers processing", () => {
    const div = document.createElement("div");
    div.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svg);
    document.body.appendChild(div);

    refreshDiagrams();

    expect(initializeDiagram).toHaveBeenCalledWith(div, 0);
  });

  test("Auto-opens diagram from share link if present", async () => {
    const { restoreViewFromURL } = await import("../src/features/lazy/share.js");

    // Simulate DiagView parameters in URL for the fast-path check
    const originalLocation = window.location;
    delete window.location;
    window.location = new URL("http://localhost?dv-idx=0");

    // Simulate finding a diagram in the URL
    const div = document.createElement("div");
    div.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    div.appendChild(svg);
    document.body.appendChild(div);

    restoreViewFromURL.mockReturnValue({ diagram: div });

    jest.useFakeTimers();

    refreshDiagrams();

    // Fast-forward to skip the 100ms timeout in checkShareLink
    jest.advanceTimersByTime(150);

    expect(openFullscreen).toHaveBeenCalledWith(div);

    jest.useRealTimers();
    window.location = originalLocation;
  });
});

describe("Observer Module: matches inside other matches", () => {
  const SVG = "<svg></svg>";
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(() => {
    document.body.innerHTML = "";
    resetConfig();
    state.observer = null;
    updateConfig({ diagramSelector: ".mermaid, .diagram" });
    jest.clearAllMocks();
    deinitializeDiagram.mockImplementation((el) => delete el.dataset.diagviewInit);
  });

  afterEach(() => {
    stopObserving();
    deinitializeDiagram.mockReset();
  });

  const setUp = () => initializeDiagram.mock.calls.map(([el]) => el.id);

  test("an outer match holding one diagram keeps the only toolbar", () => {
    document.body.innerHTML =
      `<div class="diagram" id="outer" data-title="Flow"><pre class="mermaid" id="inner">${SVG}</pre></div>` +
      `<pre class="mermaid" id="alone">${SVG}</pre>`;

    observeDiagrams();

    expect(setUp()).toEqual(["outer", "alone"]);
    expect(initializeDiagram).toHaveBeenCalledWith($("outer"), 0);
    expect(initializeDiagram).toHaveBeenCalledWith($("alone"), 2);
    // The inner one keeps its index, so share link numbers do not move
    expect($("inner").dataset.diagviewIndex).toBe("1");
  });

  test("an outer match holding two diagrams gives way to the inner ones", () => {
    document.body.innerHTML =
      `<div class="diagram" id="outer"><pre class="mermaid" id="a">${SVG}</pre>` +
      `<pre class="mermaid" id="b">${SVG}</pre></div>`;

    observeDiagrams();

    expect(setUp()).toEqual(["a", "b"]);
    expect(["outer", "a", "b"].map((id) => $(id).dataset.diagviewIndex)).toEqual(["0", "1", "2"]);
  });

  test("a chain of matches around one SVG gets one toolbar, on the outermost", () => {
    updateConfig({ diagramSelector: ".mermaid, .diagram, .chart" });
    document.body.innerHTML = `<div class="diagram" id="top"><div class="chart" id="mid"><pre class="mermaid" id="low">${SVG}</pre></div></div>`;

    observeDiagrams();

    expect(setUp()).toEqual(["top"]);
  });

  test("lazy init only watches the chosen diagrams, so scroll order cannot change the result", () => {
    const observed = [];
    const realObserver = window.IntersectionObserver;
    window.IntersectionObserver = class {
      observe(el) {
        observed.push(el.id);
      }
      unobserve() {}
      disconnect() {}
    };
    try {
      document.body.innerHTML =
        `<div class="diagram" id="one"><pre class="mermaid" id="one-in">${SVG}</pre></div>` +
        `<div class="diagram" id="two"><pre class="mermaid" id="a">${SVG}</pre><pre class="mermaid" id="b">${SVG}</pre></div>`;

      observeDiagrams();

      expect(observed).toEqual(["one", "a", "b"]);
      expect(initializeDiagram).not.toHaveBeenCalled();
    } finally {
      window.IntersectionObserver = realObserver;
    }
  });

  test("a plain page only pays one closest() call per diagram", () => {
    document.body.innerHTML =
      `<div class="diagram" id="d0">${SVG}</div><pre class="mermaid" id="d1">${SVG}</pre>` +
      `<div class="diagram" id="d2">${SVG}</div>`;
    const closest = jest.spyOn(Element.prototype, "closest");
    const queryAll = jest.spyOn(Element.prototype, "querySelectorAll");
    try {
      observeDiagrams();

      expect(closest).toHaveBeenCalledTimes(3);
      // Only the scan of the page itself, none inside a diagram
      expect(queryAll.mock.contexts.filter((el) => el.id)).toEqual([]);
      expect(deinitializeDiagram).not.toHaveBeenCalled();
      expect(setUp()).toEqual(["d0", "d1", "d2"]);
    } finally {
      closest.mockRestore();
      queryAll.mockRestore();
    }
  });

  test("a second diagram added later moves the toolbar from the outer match to both inner ones", async () => {
    document.body.innerHTML = `<div class="diagram" id="outer"><pre class="mermaid" id="a">${SVG}</pre></div>`;
    observeDiagrams();
    expect(setUp()).toEqual(["outer"]);

    const b = document.createElement("pre");
    b.className = "mermaid";
    b.id = "b";
    b.innerHTML = SVG;
    $("outer").appendChild(b);
    await wait(200);

    expect(deinitializeDiagram).toHaveBeenCalledWith($("outer"));
    expect(setUp().sort()).toEqual(["a", "b", "outer"]);
    expect($("outer").dataset.diagviewIndex).toBe("0");
  });

  test("refresh() after removing one of two inner diagrams moves the toolbar back out", () => {
    document.body.innerHTML =
      `<div class="diagram" id="outer"><pre class="mermaid" id="a">${SVG}</pre>` +
      `<pre class="mermaid" id="b">${SVG}</pre></div>`;
    observeDiagrams();
    expect(setUp()).toEqual(["a", "b"]);

    $("b").remove();
    refreshDiagrams();

    expect(deinitializeDiagram).toHaveBeenCalledWith($("a"));
    expect(setUp()).toEqual(["a", "b", "outer"]);
    expect($("a").dataset.diagviewIndex).toBe("1");
  });

  test("an SVG rendered later into an inner match sets up the outer one", async () => {
    document.body.innerHTML =
      '<div class="diagram" id="outer"><pre class="mermaid" id="inner">graph</pre></div>';
    observeDiagrams();
    expect(initializeDiagram).not.toHaveBeenCalled();

    $("inner").innerHTML = SVG;
    await wait(200);

    expect(setUp()).toEqual(["outer"]);
  });
});

describe("Observer Module: share parameters in the address bar", () => {
  let restoreViewFromURL, replaceState, originalLocation;

  const useUrl = (href) => {
    delete window.location;
    window.location = new URL(href);
  };

  beforeEach(async () => {
    ({ restoreViewFromURL } = await import("../src/features/lazy/share.js"));
    document.body.innerHTML = '<div class="diagram"><svg></svg></div>';
    resetConfig();
    state.observer = null;
    state.hasCheckedShareLink = false;
    updateConfig({ diagramSelector: ".diagram" });
    jest.clearAllMocks();
    originalLocation = window.location;
    replaceState = jest.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    stopObserving();
    replaceState.mockRestore();
    restoreViewFromURL.mockReset();
    restoreViewFromURL.mockReturnValue(null);
    window.location = originalLocation;
  });

  test("a link to a diagram that does not exist is removed, other parameters and the hash stay", () => {
    useUrl("http://localhost/page?keep=1&dv-idx=99&dv-z=2.000#part");
    restoreViewFromURL.mockReturnValue(false);

    jest.useFakeTimers();
    try {
      refreshDiagrams();
      // The diagram may still arrive, so the link waits a moment
      expect(replaceState).not.toHaveBeenCalled();
      jest.advanceTimersByTime(3000);
    } finally {
      jest.useRealTimers();
    }

    expect(openFullscreen).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, "", "http://localhost/page?keep=1#part");
    expect(state.hasCheckedShareLink).toBe(true);
  });

  test("a teardown cancels the pending removal and a new start waits in full", () => {
    useUrl("http://localhost/page?dv-idx=99");
    restoreViewFromURL.mockReturnValue(false);

    jest.useFakeTimers();
    try {
      refreshDiagrams();
      jest.advanceTimersByTime(2000);
      // What destroy() does
      resetShareLinkCheck();
      jest.advanceTimersByTime(1000);
      expect(replaceState).not.toHaveBeenCalled();

      // A later init waits its own full time
      refreshDiagrams();
      jest.advanceTimersByTime(2999);
      expect(replaceState).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
    } finally {
      jest.useRealTimers();
    }

    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  test("a link that works is removed after the diagram opens", () => {
    useUrl("http://localhost/page?dv-idx=0&dv-z=2.000");
    const diagram = document.querySelector(".diagram");
    restoreViewFromURL.mockReturnValue({ diagram, index: 0 });
    jest.useFakeTimers();
    try {
      refreshDiagrams();
      jest.advanceTimersByTime(150);
    } finally {
      jest.useRealTimers();
    }

    expect(openFullscreen).toHaveBeenCalledWith(diagram);
    expect(replaceState).toHaveBeenCalledWith(null, "", "http://localhost/page");
  });

  test("a link to a diagram in a shadow root added after init opens it", () => {
    useUrl("http://localhost/page?dv-idx=1&dv-z=2.000");
    restoreViewFromURL.mockImplementation((all) => all[1] && { diagram: all[1], index: 1 });
    const host = document.createElement("div");
    document.body.appendChild(host);

    jest.useFakeTimers();
    try {
      refreshDiagrams();
      // What initShadowRoot() does for a component that renders after init
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = '<div class="diagram"><svg></svg></div>';
      state.shadowRoots.add(root);
      refreshDiagrams();
      jest.advanceTimersByTime(3000);
    } finally {
      jest.useRealTimers();
      state.shadowRoots.clear();
    }

    expect(openFullscreen).toHaveBeenCalledWith(host.shadowRoot.querySelector(".diagram"));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(null, "", "http://localhost/page");
  });

  test("a link to a diagram still waiting for its SVG stays until the SVG arrives", () => {
    useUrl("http://localhost/page?dv-idx=0");
    const diagram = document.querySelector(".diagram");
    diagram.innerHTML = "";
    restoreViewFromURL.mockReturnValue({ diagram, index: 0 });

    refreshDiagrams();

    expect(replaceState).not.toHaveBeenCalled();
    expect(state.hasCheckedShareLink).toBe(false);
  });
});
