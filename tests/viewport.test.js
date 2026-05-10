/**
 * Viewport Module Tests
 * Tests history state management and verifies viewport meta functions are removed.
 */

import { jest } from "@jest/globals";
import { pushModalHistoryState, cleanupModalHistoryState } from "../src/ui/viewport.js";
import { state, resetConfig } from "../src/core/config.js";

describe("History State Management", () => {
  beforeEach(() => {
    resetConfig();
    state.isModalOpen = false;
    // Clean any leftover state from previous tests
    cleanupModalHistoryState();
  });

  afterEach(() => {
    cleanupModalHistoryState();
  });

  test("pushModalHistoryState pushes state with diagviewModal flag", () => {
    pushModalHistoryState(jest.fn());
    expect(history.state).toEqual({ diagviewModal: true });
  });

  test("pushModalHistoryState is idempotent (no double push)", () => {
    const mock = jest.fn();
    pushModalHistoryState(mock);
    const stateAfterFirst = history.state;

    pushModalHistoryState(mock); // should no-op
    expect(history.state).toEqual(stateAfterFirst);
  });

  test("cleanupModalHistoryState does not pop if state is not ours", () => {
    const mock = jest.fn();
    pushModalHistoryState(mock);

    // Another library pushes on top of our state
    history.pushState({ otherLib: true }, "");
    expect(history.state).toEqual({ otherLib: true });

    cleanupModalHistoryState();

    // Should NOT have gone back — current state was not diagviewModal
    expect(history.state).toEqual({ otherLib: true });

    // Clean up the other library's state manually
    history.back();
  });
});

describe("Visual Viewport Sync", () => {
  let modal;
  beforeEach(() => {
    modal = document.createElement("div");
    modal.id = "diagview-modal";
    document.body.appendChild(modal);

    // Mock visualViewport
    window.visualViewport = {
      width: 1000,
      height: 800,
      scale: 2,
      pageLeft: 100,
      pageTop: 50,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    // Explicitly mock innerHeight to ensure predictable test results
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete window.visualViewport;
  });

  test("startVisualViewportSync attaches listeners and performs initial sync", async () => {
    const { startVisualViewportSync } = await import("../src/ui/viewport.js");
    startVisualViewportSync();

    expect(window.visualViewport.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(window.visualViewport.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );

    // Check initial sync styles
    // scale(1/2) = scale(0.5)
    // baseWidth = vv.width (1000) * vv.scale (2) = 2000
    // baseHeight = window.innerHeight (800) * vv.scale (2) = 1600
    expect(modal.style.width).toBe("2000px");
    expect(modal.style.height).toBe("1600px");
    expect(modal.style.transform).toBe("translate3d(100px, 50px, 0) scale(0.5)");
    expect(modal.style.position).toBe("absolute");
  });

  test("stopVisualViewportSync removes listeners and restores styles", async () => {
    const { startVisualViewportSync, stopVisualViewportSync } =
      await import("../src/ui/viewport.js");
    startVisualViewportSync();
    stopVisualViewportSync();

    expect(window.visualViewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(window.visualViewport.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );

    // Check restored styles
    expect(modal.style.transform).toBe("");
    expect(modal.style.width).toBe("");
  });
});
