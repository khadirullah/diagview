/**
 * Auto-init opt-out on elements other than a "diagview" script tag, and the
 * data-diagview-auto-init attribute that starts DiagView despite it.
 * Like auto-init.test.js, the page is set up before src/index.js is evaluated.
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

// A bundled app: the script is named after a content hash, not "diagview",
// and the opt-out sits on it.
document.body.innerHTML = `<div class="diagram">${SVG}</div>
  <script type="module" src="/assets/index-4f2a9c.js" data-diagview-no-auto-init></script>`;

const DiagView = (await import("../src/index.js")).default;
const { state } = await import("../src/core/config.js");

describe("auto-init opt-out", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
  });

  test("the attribute on a script with any name stops auto-init", () => {
    jest.runAllTimers();
    expect(state.isInitialized).toBe(false);
  });

  test("the attribute on <html> stops auto-init", () => {
    document.querySelector("script").removeAttribute("data-diagview-no-auto-init");
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    // Nothing has started yet, so a late init() after an await applies its options
    jest.runAllTimers();
    expect(state.isInitialized).toBe(false);
    DiagView.init({ layout: "header" });
    expect(DiagView.getConfiguration().layout).toBe("header");
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Already initialized"));
    document.documentElement.removeAttribute("data-diagview-no-auto-init");
  });
});

describe("forced auto-init", () => {
  // Auto-init runs once per evaluation of src/index.js. Each case imports a
  // fresh copy with its own query string after setting up the page, so that
  // copy's auto-init reads this page. The query string only gets past the
  // module cache and means nothing else. The copies share the same state.
  let fresh;

  afterEach(async () => {
    if (state.isInitialized) await fresh.destroy();
    jest.runAllTimers();
    fresh = null;
    document.documentElement.removeAttribute("data-diagview-no-auto-init");
    document.body.innerHTML = "";
  });

  test("data-diagview-auto-init wins over the opt-out on a script", async () => {
    document.body.innerHTML = `<div class="diagram" data-diagview-auto-init>${SVG}</div>
      <script type="module" src="/assets/index-4f2a9c.js" data-diagview-no-auto-init></script>`;
    fresh = (await import("../src/index.js?forced-script")).default;
    expect(state.isInitialized).toBe(false);
    jest.runAllTimers();
    expect(state.isInitialized).toBe(true);
  });

  test("data-diagview-auto-init wins over the opt-out on <html>", async () => {
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    document.body.innerHTML = `<main data-diagview-auto-init><div class="diagram">${SVG}</div></main>`;
    fresh = (await import("../src/index.js?forced-html")).default;
    jest.runAllTimers();
    expect(state.isInitialized).toBe(true);
  });

  test("data-diagview-auto-init starts DiagView on a page with no diagram yet", async () => {
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    document.body.innerHTML = `<main data-diagview-auto-init></main>`;
    fresh = (await import("../src/index.js?forced-empty")).default;
    jest.runAllTimers();
    expect(state.isInitialized).toBe(true);
  });

  test("the opt-out still holds without data-diagview-auto-init", async () => {
    document.documentElement.setAttribute("data-diagview-no-auto-init", "");
    document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
    fresh = (await import("../src/index.js?not-forced")).default;
    jest.runAllTimers();
    expect(state.isInitialized).toBe(false);
  });
});
