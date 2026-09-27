/**
 * A late init() after auto-init has already run. Like auto-init.test.js, the
 * page is set up before src/index.js is evaluated.
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

document.body.innerHTML = `<div class="diagram">${SVG}</div>`;
const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

const DiagView = (await import("../src/index.js")).default;
const { state } = await import("../src/core/config.js");

describe("init() after auto-init", () => {
  afterAll(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("the warning says the options were ignored and how to stop auto-init", () => {
    jest.runAllTimers(); // auto-init runs, as it does during an app's await
    expect(state.isInitialized).toBe(true);

    DiagView.init({ layout: "header" });
    expect(DiagView.getConfiguration().layout).not.toBe("header");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("options were ignored"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("data-diagview-no-auto-init"));
  });

  test("after destroy() a second init() gets the plain warning", async () => {
    await DiagView.destroy();
    warnSpy.mockClear();
    DiagView.init();
    DiagView.init();
    expect(warnSpy).toHaveBeenCalledWith("DiagView: Already initialized. Call destroy() first.");
  });
});
