/**
 * Review round 2 — lifecycle, init and configuration fixes.
 *
 * The auto-init tests need fake timers installed and diagrams present BEFORE
 * src/index.js is evaluated, because auto-init is scheduled during module
 * evaluation. Everything else in this file uses the already-loaded module.
 */
import { jest } from "@jest/globals";

jest.useFakeTimers();

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';

// Page state at "module evaluation" time: a diagram is present and there is
// no opt-out attribute, so the library would auto-initialise itself.
document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
const autoInitWarn = jest.spyOn(console, "warn").mockImplementation(() => {});

const DiagView = (await import("../src/index.js")).default;
const { state, DEFAULT_CONFIG } = await import("../src/core/config.js");

describe("auto-init scheduling (finding 1)", () => {
  afterAll(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    autoInitWarn.mockRestore();
  });

  test("a manual init() issued right after module evaluation wins over auto-init", () => {
    // Module and defer scripts run at readyState "interactive": the library has
    // just been evaluated and the user's own init() follows one line later.
    expect(state.isInitialized).toBe(false); // nothing initialised synchronously

    DiagView.init({ layout: "header" });
    jest.runAllTimers(); // would fire the pending auto-init if it was not cancelled

    expect(state.isInitialized).toBe(true);
    expect(DiagView.getConfiguration().layout).toBe("header");
    expect(document.querySelectorAll(".diagview-label")).toHaveLength(1);
    expect(autoInitWarn).not.toHaveBeenCalledWith(expect.stringContaining("Already initialized"));
  });
});

describe("destroy() restores every touched element (finding 2)", () => {
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
    document.body.innerHTML = `<div class="diagram" data-diagview-accent="#ff0000">${SVG}</div>`;
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
    expect(el.style.getPropertyValue("--dv-accent")).toBe("");
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

    await DiagView.destroy();

    expect(root.style.getPropertyValue("--dv-bg")).toBe("");
    expect(root.style.getPropertyValue("--dv-text-color")).toBe("");
    expect(root.style.getPropertyValue("--dv-accent")).toBe("");
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

describe("refresh() recovers error-boundary diagrams (finding 12)", () => {
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

describe("teardown safety and diagramSelector validation (finding 3)", () => {
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

describe("shadow DOM styles and indexing (finding 6)", () => {
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
