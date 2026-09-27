import { jest } from "@jest/globals";
import DiagView, { init, destroy } from "../src/index.js";
import { state, resetConfig, DEFAULT_CONFIG } from "../src/core/config.js";
import { detectTheme } from "../src/core/theme.js";

jest.useFakeTimers();

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';

describe("DiagView Lifecycle", () => {
  let warnSpy;

  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  beforeEach(() => {
    // Reset any state
    resetConfig();
    state.isInitialized = false;

    // Clear DOM
    document.body.innerHTML = "";
    document.head.innerHTML = "";

    // Spy on console warnings
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Ensure cleanup
    await destroy();
    // Flush any pending async tasks from the observer module (e.g. debounced functions)
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("init() returns a promise and still initializes synchronously", async () => {
    const result = init();
    expect(result).toBeInstanceOf(Promise);
    expect(state.isInitialized).toBe(true);
    await result;
    expect(state.isInitialized).toBe(true);
  });

  test("init() issued while destroy() is in flight waits for it, then initializes", async () => {
    // React StrictMode / HMR sequence: cleanup starts destroy(), effect re-runs init()
    init();
    const teardown = destroy();
    const reinit = init({ layout: "off" });

    // init must not have bailed out with the "Already initialized" warning
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already initialized"));

    await teardown;
    await reinit;

    expect(state.isInitialized).toBe(true);
    expect(state.config.layout).toBe("off");
    expect(document.getElementById("diagview-modal")).not.toBeNull();
  });

  test("destroy() called twice during teardown returns the same promise", async () => {
    init();
    const first = destroy();
    const second = destroy();
    expect(second).toBe(first);
    await first;
    expect(state.isInitialized).toBe(false);
  });

  test("init() sets up DOM elements and updates state", () => {
    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();

    init();

    expect(state.isInitialized).toBe(true);
    expect(document.getElementById("diagview-modal")).not.toBeNull();
  });

  test("destroy() removes DOM elements and resets state", async () => {
    init();
    expect(state.isInitialized).toBe(true);
    expect(document.getElementById("diagview-modal")).not.toBeNull();

    await destroy();

    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();

    // Check other dynamic elements
    const elementsToCheck = [
      "diagview-toast",
      "diagview-temp-menu",
      "diagview-help-modal",
      "diagview-minimap",
      "diagview-laser",
    ];
    elementsToCheck.forEach((id) => {
      expect(document.getElementById(id)).toBeNull();
    });
  });

  test("double init() warns and returns early", () => {
    init();
    expect(state.isInitialized).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();

    init(); // Second time
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Already initialized"));
  });

  test("init() applies a new accentColor even after destroy() and a cached theme", async () => {
    init({ accentColor: "#f59e0b" });
    expect(detectTheme().accent).toBe("#f59e0b");

    await destroy();
    detectTheme(); // caches a theme built from the old config
    init({ accentColor: "#10b981" });
    expect(detectTheme().accent).toBe("#10b981");
  });

  test("destroy() before init() warns and returns early", async () => {
    expect(state.isInitialized).toBe(false);

    await destroy(); // Destory without init

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
  });
});

describe("destroy() restores every touched element", () => {
  let warnSpy;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("layout off -> destroy -> layout header wraps the diagram", async () => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    const el = document.querySelector(".diagram");
    const svg = el.querySelector("svg");

    DiagView.init({ layout: "off" });
    expect(el.dataset.diagviewInit).toBe("1");
    expect(el.style.cursor).toBe("pointer");
    expect(svg.classList.contains("dv-svg-content")).toBe(true);

    await DiagView.destroy();

    expect(el.dataset.diagviewInit).toBeUndefined();
    expect(el.dataset.diagviewIndex).toBeUndefined();
    expect(el.dataset.diagviewId).toBeUndefined();
    expect(el.style.cursor).toBe("");
    expect(svg.classList.contains("dv-svg-content")).toBe(false);
    expect(svg.style.transition).toBe("");

    DiagView.init({ layout: "header" });
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
    expect(document.querySelectorAll(".diagview-label")).toHaveLength(1);
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
  });

  test("error-boundary diagram is restored on destroy", async () => {
    document.body.innerHTML = `<div class="diagram"><svg xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    const el = document.querySelector(".diagram");
    const svg = el.querySelector("svg");

    DiagView.init();
    expect(el.querySelector(".diagview-error")).not.toBeNull();
    expect(el.dataset.diagviewError).toBe("1");
    expect(svg.style.display).toBe("none");

    await DiagView.destroy();

    expect(el.querySelector(".diagview-error")).toBeNull();
    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.dataset.diagviewInit).toBeUndefined();
    expect(svg.style.display).toBe("");
  });

  test("root CSS variables are cleared on destroy", async () => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    const root = document.documentElement;

    DiagView.init();
    DiagView.refresh(); // syncTheme() writes the variables onto <html>
    expect(root.style.getPropertyValue("--dv-bg")).not.toBe("");
    expect(root.style.getPropertyValue("--dv-search-ring")).not.toBe("");

    await DiagView.destroy();

    expect(root.style.getPropertyValue("--dv-bg")).toBe("");
    expect(root.style.getPropertyValue("--dv-text-color")).toBe("");
    expect(root.style.getPropertyValue("--dv-accent")).toBe("");
    expect(root.style.getPropertyValue("--dv-search-ring")).toBe("");
    expect(root.style.getPropertyValue("--dv-toggle-track")).toBe("");
  });

  test("init applies the accent before the viewer ever opens", async () => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    const root = document.documentElement;

    DiagView.init({ accentColor: "#ff0000", layout: "header" });
    expect(root.style.getPropertyValue("--dv-accent")).toBe("#ff0000");
    expect(root.style.getPropertyValue("--dv-bg")).not.toBe("");

    // destroy clears the variables, so a second init must write them again
    await DiagView.destroy();
    expect(root.style.getPropertyValue("--dv-accent")).toBe("");
    DiagView.init({ accentColor: "#00aa00" });
    expect(root.style.getPropertyValue("--dv-accent")).toBe("#00aa00");
  });

  test("shadow-root diagrams are unwrapped on destroy", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div class="diagram">${SVG}</div>`;
    const el = shadow.querySelector(".diagram");

    DiagView.init({ layout: "header" });
    DiagView.initShadowRoot(shadow);
    expect(shadow.querySelector(".diagview-wrapper")).not.toBeNull();

    await DiagView.destroy();

    expect(shadow.querySelector(".diagview-wrapper")).toBeNull();
    expect(el.dataset.diagviewInit).toBeUndefined();
    expect(el.parentNode).toBe(shadow);
  });
});

describe("refresh() recovers error-boundary diagrams", () => {
  let warnSpy;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("replacing a broken SVG with a valid one and calling refresh() initialises it", () => {
    document.body.innerHTML = `<div class="diagram"><svg xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    const el = document.querySelector(".diagram");

    DiagView.init({ layout: "header" });
    expect(el.dataset.diagviewError).toBe("1");
    expect(el.querySelector(".diagview-error")).not.toBeNull();

    el.innerHTML = SVG;
    DiagView.refresh();

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.querySelector(".diagview-error")).toBeNull();
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
    expect(document.querySelectorAll(".diagview-label")).toHaveLength(1);
  });

  test("refresh() leaves a still-broken diagram in its error state without duplicating the error UI", () => {
    document.body.innerHTML = `<div class="diagram"><svg xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    const el = document.querySelector(".diagram");

    DiagView.init({ layout: "header" });
    DiagView.refresh();

    expect(el.dataset.diagviewError).toBe("1");
    expect(el.querySelectorAll(".diagview-error")).toHaveLength(1);
  });
});

describe("teardown safety and diagramSelector validation", () => {
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    document.head.innerHTML = "";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("configure() with an invalid diagramSelector warns and keeps the previous one", () => {
    DiagView.init();
    DiagView.configure({ diagramSelector: ".custom-diagram" });
    expect(DiagView.getConfiguration().diagramSelector).toBe(".custom-diagram");

    warnSpy.mockClear();
    DiagView.configure({ diagramSelector: "[[[" });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("diagramSelector"));
    expect(DiagView.getConfiguration().diagramSelector).toBe(".custom-diagram");
  });

  test("init() with a non-string diagramSelector falls back to the default", () => {
    DiagView.init({ diagramSelector: 42 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("diagramSelector"));
    expect(DiagView.getConfiguration().diagramSelector).toBe(DEFAULT_CONFIG.diagramSelector);
  });

  test("a throwing teardown step still resets state and removes the modal", async () => {
    DiagView.init();
    expect(document.getElementById("diagview-modal")).not.toBeNull();

    // Poison the DOM phase of _teardown: a "shadow root" whose query throws.
    state.shadowRoots.add({
      querySelectorAll() {
        throw new Error("boom");
      },
    });

    await expect(DiagView.destroy()).resolves.toBeUndefined();

    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("teardown"), expect.any(Error));

    // And a later init() is accepted again
    DiagView.init({ layout: "header" });
    expect(state.isInitialized).toBe(true);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already initialized"));
  });
});

describe("shadow DOM styles and indexing", () => {
  let warnSpy;
  let host;
  let shadow;

  const shadowHasStyles = (root) =>
    !!root.querySelector("style[data-diagview-styles]") ||
    (Array.isArray(root.adoptedStyleSheets) && root.adoptedStyleSheets.length > 0);

  beforeEach(() => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    document.head.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div class="diagram">${SVG}</div>`;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("initShadowRoot injects the stylesheet into the shadow root and destroy removes it", async () => {
    DiagView.init({ layout: "header" });
    expect(shadowHasStyles(shadow)).toBe(false);

    DiagView.initShadowRoot(shadow);
    expect(shadowHasStyles(shadow)).toBe(true);

    // Idempotent
    DiagView.initShadowRoot(shadow);
    expect(shadow.querySelectorAll("style[data-diagview-styles]").length).toBeLessThanOrEqual(1);

    await DiagView.destroy();
    expect(shadowHasStyles(shadow)).toBe(false);
  });

  test("shadow diagrams get a stable index after the document diagrams", () => {
    DiagView.init({ layout: "header" });
    DiagView.initShadowRoot(shadow);

    const pageDiagram = document.querySelector(".diagram");
    const shadowDiagram = shadow.querySelector(".diagram");

    expect(pageDiagram.dataset.diagviewIndex).toBe("0");
    expect(shadowDiagram.dataset.diagviewIndex).toBe("1");
    expect(shadowDiagram.dataset.diagviewIndex).not.toBe("-1");
  });
});
