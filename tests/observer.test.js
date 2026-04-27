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
const { state, resetConfig } = await import("../src/core/config.js");
const { observeDiagrams, stopObserving, refreshDiagrams } = await import("../src/core/observer.js");
const { initializeDiagram } = await import("../src/features/diagram-init.js");
const { openFullscreen } = await import("../src/ui/modal.js");

describe("Observer Module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetConfig();
    state.observer = null;
    state.config.diagramSelector = ".diagram";
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

    expect(initializeDiagram).toHaveBeenCalledWith(div);
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

    expect(initializeDiagram).toHaveBeenCalledWith(div);
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

    expect(initializeDiagram).toHaveBeenCalledWith(nested);
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

    expect(initializeDiagram).toHaveBeenCalledWith(div);
  });

  test("Auto-opens diagram from share link if present", async () => {
    const { restoreViewFromURL } = await import("../src/features/lazy/share.js");

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
  });
});
