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
const { state } = await import("../src/core/config.js");

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
