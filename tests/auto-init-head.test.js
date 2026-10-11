/**
 * The script in <head>: src/index.js is evaluated while the page is still
 * loading, so auto-init waits for DOMContentLoaded.
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

Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
const DiagView = (await import("../src/index.js")).default;
const { state } = await import("../src/core/config.js");
delete document.readyState;

const pageLoaded = () => {
  document.dispatchEvent(new Event("DOMContentLoaded"));
  jest.runAllTimers();
};

describe("destroy() before the page has loaded", () => {
  beforeEach(() => {
    // destroy() with nothing started says "Not initialized"
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(async () => {
    await DiagView.destroy();
    jest.runAllTimers();
  });

  test("cancels the auto-init still waiting for DOMContentLoaded", async () => {
    await DiagView.destroy();
    pageLoaded();
    expect(state.isInitialized).toBe(false);
  });

  test("cancels an init() still waiting for DOMContentLoaded", async () => {
    const body = document.body;
    body.remove();
    Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
    let started;
    try {
      started = DiagView.init({ layout: "header" });
      await DiagView.destroy();
    } finally {
      delete document.readyState;
      document.documentElement.appendChild(body);
    }
    pageLoaded();
    await started;
    expect(state.isInitialized).toBe(false);

    // A later init() starts as usual
    await DiagView.init({ layout: "header" });
    expect(state.isInitialized).toBe(true);
    expect(DiagView.getConfiguration().layout).toBe("header");
  });

  test("cancels an init() queued behind a destroy() in flight", async () => {
    const first = DiagView.destroy();
    const queued = DiagView.init();
    const second = DiagView.destroy();
    await Promise.all([first, queued, second]);
    expect(state.isInitialized).toBe(false);
  });
});
