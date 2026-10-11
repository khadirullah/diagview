import { jest } from "@jest/globals";
import DiagView, { init, destroy } from "../src/index.js";
import { state, resetConfig, DEFAULT_CONFIG } from "../src/core/config.js";
import { detectTheme } from "../src/core/theme.js";
import { saveZoomState, restoreZoomState } from "../src/features/panzoom-integration.js";
import { showSuccessToast } from "../src/ui/toast.js";

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

  test("init() called before the page has a <body> waits for DOMContentLoaded", async () => {
    // A script in <head> runs before the parser has created <body>
    const body = document.body;
    body.remove();
    expect(document.body).toBeNull();
    Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });

    let result;
    try {
      expect(() => (result = init({ layout: "header" }))).not.toThrow();
      expect(state.isInitialized).toBe(false);
    } finally {
      delete document.readyState;
    }

    document.documentElement.appendChild(body);
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    document.dispatchEvent(new Event("DOMContentLoaded"));
    await result;

    expect(state.isInitialized).toBe(true);
    expect(DiagView.getConfiguration().layout).toBe("header");
    expect(document.getElementById("diagview-modal")).not.toBeNull();
  });

  test("init() on a parsed page with no <body> settles at once without starting", async () => {
    // An SVG file has no <body>, and DOMContentLoaded has already fired
    const body = document.body;
    body.remove();
    let settled = false;
    try {
      init().then(() => (settled = true));
      await Promise.resolve();
    } finally {
      document.documentElement.appendChild(body);
    }

    expect(settled).toBe(true);
    expect(state.isInitialized).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no <body>"));
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
    showSuccessToast("Link copied");
    expect(document.getElementById("diagview-toast-live")).not.toBeNull();

    await destroy();

    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();

    // Check other dynamic elements
    const elementsToCheck = [
      "diagview-toast-container",
      "diagview-toast-live",
      "diagview-temp-menu",
      "diagview-help-modal",
      "diagview-minimap",
      "diagview-laser",
    ];
    elementsToCheck.forEach((id) => {
      expect(document.getElementById(id)).toBeNull();
    });
  });

  test("a teardown step that throws does not skip the steps after it", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    init();
    DiagView.initShadowRoot(root);
    const styled = () =>
      !!root.querySelector("style[data-diagview-styles]") || root.adoptedStyleSheets?.length > 0;
    expect(styled()).toBe(true);
    // A root that throws when DiagView looks for its diagrams
    state.shadowRoots.add({
      querySelectorAll() {
        throw new Error("broken root");
      },
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await destroy();

    expect(errorSpy).toHaveBeenCalledWith("DiagView: Error during teardown:", expect.any(Error));
    expect(styled()).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();
    expect(state.isInitialized).toBe(false);
    errorSpy.mockRestore();
  });

  test("destroy() forgets remembered zoom states", async () => {
    init({ rememberZoom: true });
    const pz = {
      getScale: () => 2,
      getPan: () => ({ x: 5, y: 6 }),
      zoom: jest.fn(),
      pan: jest.fn(),
    };
    saveZoomState("d-destroy", pz);
    expect(restoreZoomState("d-destroy", pz)).toBe(true);

    await destroy();
    init({ rememberZoom: true });
    expect(restoreZoomState("d-destroy", pz)).toBe(false);
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

  test("init() after destroy() warns when it leaves out the page's selector", async () => {
    init({ diagramSelector: ".custom-mermaid" });
    await destroy();
    init();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not ".custom-mermaid"'));

    // Only the first init() after that destroy() warns
    warnSpy.mockClear();
    await destroy();
    init();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("init() after destroy() does not warn with the selector or the saved options", async () => {
    init({ diagramSelector: ".custom-mermaid", layout: "off", offHint: "icon" });
    const saved = DiagView.getConfiguration();
    await destroy();
    init(saved);
    expect(state.config.diagramSelector).toBe(".custom-mermaid");
    expect(state.config.offHint).toBe("icon");

    await destroy();
    init({ diagramSelector: ".custom-mermaid" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("init() after destroy() does not warn when the page used the default selector", async () => {
    // Start after a destroy() of an instance that used the default selector
    init();
    await destroy();
    warnSpy.mockClear();

    init({ layout: "header" });
    await destroy();
    init();
    expect(warnSpy).not.toHaveBeenCalled();
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
    // The cursor comes from styles.css, not an inline style
    expect(el.style.cursor).toBe("");
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

  test.each(["icon", "label", "below"])(
    "layout off with the %s hint: destroy restores the page exactly",
    async (offHint) => {
      document.body.innerHTML = `<main><div class="diagram">${SVG}</div><div data-diagram>${SVG}</div>${SVG.replace("<svg", '<svg class="chart"')}</main>`;
      const before = document.body.innerHTML;

      DiagView.init({ layout: "off", offHint });
      expect(document.querySelectorAll(".diagview-off-hint")).toHaveLength(3);

      await DiagView.destroy();
      expect(document.body.innerHTML).toBe(before);
    },
  );

  test("offHint set by configure() reaches diagrams set up after it, as layout does", async () => {
    document.body.innerHTML = `<main><div class="diagram" id="a">${SVG}</div></main>`;
    DiagView.init({ layout: "off" });
    DiagView.configure({ offHint: "label", offHintText: { mouse: "Open" } });
    expect(document.querySelector(".diagview-off-hint")).toBeNull();

    document
      .querySelector("main")
      .insertAdjacentHTML("beforeend", `<div class="diagram" id="b">${SVG}</div>`);
    await Promise.resolve();
    jest.advanceTimersByTime(150);

    const hint = document.querySelector("#b .diagview-off-hint--label");
    expect(hint.textContent).toBe("OpenTap to expand");
    expect(document.querySelector("#a .diagview-off-hint")).toBeNull();
  });

  test("a diagram opened before its lazy init keeps its id through init and loses it on destroy", async () => {
    const realObserver = window.IntersectionObserver;
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
      const el = document.querySelector(".diagram");
      DiagView.init();
      expect(el.dataset.diagviewInit).toBeUndefined();

      el.dataset.diagviewId = "dv-early"; // what the viewer sets on open
      await DiagView.destroy();
      expect(el.dataset.diagviewId).toBeUndefined();
    } finally {
      window.IntersectionObserver = realObserver;
    }

    const el = document.querySelector(".diagram");
    el.dataset.diagviewId = "dv-early";
    DiagView.init();
    expect(el.dataset.diagviewInit).toBe("1");
    expect(el.dataset.diagviewId).toBe("dv-early");
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
    expect(root.style.getPropertyValue("--dv-muted-text")).toBe("");
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

describe("diagrams the page renders again in place", () => {
  // What Mermaid 10 and 11 draw for a diagram with a typo
  const ERROR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2412 512" aria-roledescription="error"><g><path class="error-icon" d="m411 400 1 2z"/><text class="error-text">Syntax error in text</text><text class="error-text">mermaid version 11.4.0</text></g></svg>`;
  const OTHER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="5" cy="5" r="4"/></svg>';
  let warnSpy;
  let onError;

  // Let the MutationObserver see the change, then run its debounce
  const settle = async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(150);
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    onError = jest.fn();
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  const start = (svg, layout = "header") => {
    document.body.innerHTML = `<main><pre class="diagram">${svg}</pre></main>`;
    DiagView.init({ layout, onError });
    return document.querySelector(".diagram");
  };

  test("a fixed diagram gets its toolbar without refresh()", async () => {
    const el = start(ERROR_SVG);
    expect(el.dataset.diagviewError).toBe("1");

    // A live editor renders the corrected code into the same element
    el.innerHTML = SVG;
    await settle();

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.querySelector(".diagview-error")).toBeNull();
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
    expect(el.querySelector("svg").style.display).toBe("");
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("source text first and the SVG later still recovers", async () => {
    const el = start(ERROR_SVG);

    el.textContent = "flowchart TD\n  A --> B";
    await settle();
    expect(el.dataset.diagviewError).toBe("1");

    el.innerHTML = `<div id="dmermaid-1">${SVG}</div>`;
    await settle();

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
  });

  test("an SVG fixed in place recovers too", async () => {
    document.body.innerHTML = `<main><div class="diagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg></div></main>`;
    DiagView.init({ layout: "header", onError });
    const el = document.querySelector(".diagram");
    expect(el.dataset.diagviewError).toBe("1");

    el.querySelector("svg").innerHTML = '<rect width="5" height="5"/>';
    await settle();

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
  });

  test("a new error replaces the old error box instead of showing Mermaid's", async () => {
    const el = start(ERROR_SVG);

    el.innerHTML = ERROR_SVG;
    await settle();

    const svg = el.querySelector("svg:not(.diagview-error-icon)");
    expect(el.dataset.diagviewError).toBe("1");
    expect(el.querySelectorAll(".diagview-error")).toHaveLength(1);
    expect(svg.style.display).toBe("none");
    expect(onError).toHaveBeenCalledTimes(2);

    // DiagView's own error box arriving does not start another round
    await settle();
    jest.runAllTimers();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll(".diagview-error")).toHaveLength(1);
  });

  test("a working diagram that turns into an error loses its toolbar, and gets it back", async () => {
    const el = start(SVG);
    expect(el.closest(".diagview-wrapper")).not.toBeNull();

    el.innerHTML = ERROR_SVG;
    await settle();

    expect(document.querySelector(".diagview-wrapper")).toBeNull();
    expect(el.parentElement.tagName).toBe("MAIN");
    expect(el.dataset.diagviewError).toBe("1");
    expect(el.querySelector(".diagview-error")).not.toBeNull();

    el.innerHTML = SVG;
    await settle();

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
  });

  test("a working diagram that gets another valid SVG keeps its toolbar", async () => {
    const el = start(SVG);
    const wrapper = el.closest(".diagview-wrapper");

    el.innerHTML = OTHER_SVG;
    await settle();

    expect(el.closest(".diagview-wrapper")).toBe(wrapper);
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
    expect(el.dataset.diagviewError).toBeUndefined();
  });

  test("layout off: an error drops the click target and a fix brings it back", async () => {
    const el = start(SVG, "off");
    expect(el.getAttribute("role")).toBe("button");

    el.innerHTML = ERROR_SVG;
    await settle();
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.dataset.diagviewError).toBe("1");

    el.innerHTML = SVG;
    await settle();
    expect(el.getAttribute("role")).toBe("button");
    expect(el.dataset.diagviewError).toBeUndefined();
  });

  test("layout off: a new render gets the off hint back once, with no further rounds", async () => {
    document.body.innerHTML = `<main><pre class="diagram">${SVG}</pre></main>`;
    DiagView.init({ layout: "off", offHint: "icon" });
    const el = document.querySelector(".diagram");
    expect(el.querySelectorAll(".diagview-off-hint")).toHaveLength(1);

    el.innerHTML = OTHER_SVG;
    await settle();
    expect(el.querySelectorAll(".diagview-off-hint")).toHaveLength(1);
    expect(el.lastElementChild.className).toBe("diagview-off-hint diagview-off-hint--icon");

    // The hint coming back does not start another round
    await settle();
    jest.runAllTimers();
    expect(el.querySelectorAll(".diagview-off-hint")).toHaveLength(1);
    expect(el.dataset.diagviewInit).toBe("1");

    el.innerHTML = ERROR_SVG;
    await settle();
    expect(el.querySelector(".diagview-off-hint")).toBeNull();
    expect(el.classList.contains("diagview-off-host")).toBe(false);

    el.innerHTML = SVG;
    await settle();
    expect(el.querySelectorAll(".diagview-off-hint")).toHaveLength(1);
    expect(el.classList.contains("diagview-off-host")).toBe(true);
  });

  test("a shadow root diagram recovers when initShadowRoot() runs again", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div class="diagram">${ERROR_SVG}</div>`;
    const el = shadow.querySelector(".diagram");
    DiagView.init({ layout: "header" });
    DiagView.initShadowRoot(shadow);
    expect(el.dataset.diagviewError).toBe("1");

    el.innerHTML = SVG;
    DiagView.initShadowRoot(shadow);

    expect(el.dataset.diagviewError).toBeUndefined();
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
  });

  test("destroy() after a recovery leaves the plain element", async () => {
    const el = start(ERROR_SVG);
    el.innerHTML = SVG;
    await settle();

    await DiagView.destroy();
    expect(el.parentElement.tagName).toBe("MAIN");
    expect(Object.keys(el.dataset)).toEqual([]);
    expect(el.querySelector("svg").hasAttribute("style")).toBe(false);
    expect(el.querySelector("svg").hasAttribute("class")).toBe(false);

    // A later init() sets it up once
    DiagView.init({ layout: "header" });
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
  });
});

describe("diagrams the page removes without destroy()", () => {
  let warnSpy;

  // Let the MutationObserver see the change, then run its debounce
  const settle = async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(150);
  };

  let before;

  beforeEach(() => {
    document.body.innerHTML = `<main id="route"><p>Intro</p><div class="diagram">${SVG}</div></main><aside></aside>`;
    before = document.getElementById("route").innerHTML;
    document.head.innerHTML = "";
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    DiagView.init({ layout: "header" });
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  const route = () => document.getElementById("route");

  test("a route swapped out releases its diagram and gives the old markup back", async () => {
    const main = route();
    const el = main.querySelector(".diagram");
    expect(el.closest(".diagview-wrapper")).not.toBeNull();

    main.remove();
    await settle();

    expect(main.innerHTML).toBe(before);
    expect(Object.keys(el.dataset)).toEqual([]);

    // destroy() finds nothing of it left to restore
    await DiagView.destroy();
    expect(main.innerHTML).toBe(before);
  });

  test("a route put back after the observer ran gets its toolbar again", async () => {
    const main = route();
    const el = main.querySelector(".diagram");
    main.remove();
    await settle();
    expect(el.dataset.diagviewInit).toBeUndefined();

    document.body.prepend(main);
    await settle();

    expect(el.dataset.diagviewInit).toBe("1");
    expect(el.closest(".diagview-wrapper")).not.toBeNull();
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
  });

  test("a route taken out and put back before the observer runs keeps its card", async () => {
    const main = route();
    const wrapper = main.querySelector(".diagview-wrapper");
    main.remove();
    await Promise.resolve();
    jest.advanceTimersByTime(50);
    document.body.prepend(main);
    await settle();

    expect(main.querySelector(".diagview-wrapper")).toBe(wrapper);
    expect(document.querySelectorAll(".diagview-wrapper")).toHaveLength(1);
  });

  test("a diagram moved to another place on the page keeps its card", async () => {
    const wrapper = document.querySelector(".diagview-wrapper");
    document.querySelector("aside").appendChild(route());
    await settle();

    expect(document.querySelector("aside .diagview-wrapper")).toBe(wrapper);
    expect(document.querySelector(".diagram").dataset.diagviewInit).toBe("1");
  });

  test("a diagram the page removes from inside its card takes the empty card with it", async () => {
    const el = document.querySelector(".diagram");
    el.remove();
    await settle();

    expect(el.isConnected).toBe(false);
    expect(document.querySelector(".diagview-wrapper")).toBeNull();
    expect(route().innerHTML).toBe("<p>Intro</p>");
  });

  test("a diagram that left with the error box gets it back when it returns", async () => {
    route().innerHTML = '<div class="diagram"><svg xmlns="http://www.w3.org/2000/svg"></svg></div>';
    await settle();
    const main = route();
    const el = main.querySelector(".diagram");
    expect(el.dataset.diagviewError).toBe("1");

    main.remove();
    await settle();
    expect(el.querySelector(".diagview-error")).toBeNull();
    expect(el.querySelector("svg").hasAttribute("style")).toBe(false);

    document.body.prepend(main);
    await settle();
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

describe("config from untrusted JSON", () => {
  let warnSpy;

  beforeEach(() => {
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    delete Object.prototype.polluted;
    warnSpy.mockRestore();
  });

  const payloads = [
    '{"security":{"__proto__":{"polluted":1}}}',
    '{"watermark":{"__proto__":{"polluted":1}}}',
    '{"ui":{"buttons":{"icons":{"__proto__":{"polluted":1}}}}}',
    '{"ui":{"constructor":{"prototype":{"polluted":1}}}}',
    '{"__proto__":{"polluted":1}}',
  ];

  test.each(payloads)("init() with %s leaves Object.prototype alone", (json) => {
    DiagView.init(JSON.parse(json));
    expect({}.polluted).toBeUndefined();
    expect(DiagView.getConfiguration().security.mode).toBe("strict");
  });

  test.each(payloads)("configure() with %s leaves Object.prototype alone", (json) => {
    DiagView.init();
    DiagView.configure(JSON.parse(json));
    expect({}.polluted).toBeUndefined();
  });

  test("the same JSON still merges its normal nested keys", () => {
    DiagView.init(
      JSON.parse(
        '{"security":{"mode":"permissive","__proto__":{"polluted":1}},' +
          '"watermark":{"enabled":true,"text":"Draft"}}',
      ),
    );
    const config = DiagView.getConfiguration();
    expect({}.polluted).toBeUndefined();
    expect(config.security.mode).toBe("permissive");
    expect(config.security.allowOverrides).toBe(DEFAULT_CONFIG.security.allowOverrides);
    expect(config.watermark.text).toBe("Draft");
    expect(config.watermark.position).toBe(DEFAULT_CONFIG.watermark.position);
  });
});
