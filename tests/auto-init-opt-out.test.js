/**
 * Auto-init opt-out on elements other than a "diagview" script tag.
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
const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

const DiagView = (await import("../src/index.js")).default;
const { state } = await import("../src/core/config.js");

describe("auto-init opt-out", () => {
  afterAll(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
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
