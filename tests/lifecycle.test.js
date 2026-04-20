import { jest } from "@jest/globals";
import DiagView, { init, destroy } from "../src/index.js";
import { state, resetConfig } from "../src/core/config.js";

describe("DiagView Lifecycle", () => {
  let warnSpy;

  beforeAll(() => {
    jest.useFakeTimers();

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

  afterAll(() => {
    jest.useRealTimers();
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

  afterEach(() => {
    // Ensure cleanup
    destroy();
    // Flush any pending async tasks from the observer module (e.g. debounced functions)
    jest.runAllTimers();
    warnSpy.mockRestore();
  });

  test("init() sets up DOM elements and updates state", () => {
    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();

    init();

    expect(state.isInitialized).toBe(true);
    expect(document.getElementById("diagview-modal")).not.toBeNull();
  });

  test("destroy() removes DOM elements and resets state", () => {
    init();
    expect(state.isInitialized).toBe(true);
    expect(document.getElementById("diagview-modal")).not.toBeNull();

    destroy();

    expect(state.isInitialized).toBe(false);
    expect(document.getElementById("diagview-modal")).toBeNull();

    // Check other dynamic elements
    const elementsToCheck = [
      "diagview-toast",
      "diagview-temp-menu",
      "diagview-help",
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

  test("destroy() before init() warns and returns early", () => {
    expect(state.isInitialized).toBe(false);

    destroy(); // Destory without init

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
  });
});
