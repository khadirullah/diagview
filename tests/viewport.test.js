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

    // Mock visualViewport with the properties used by the Scale-Free approach:
    // width/height = exact visual viewport dimensions (no scaling)
    // offsetLeft/offsetTop = visual viewport offset from layout viewport
    window.visualViewport = {
      width: 1000,
      height: 800,
      scale: 2,
      offsetLeft: 100,
      offsetTop: 50,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
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

    // Scale-Free approach: modal is sized to exact visual viewport dimensions
    // (no counter-scaling), positioned with translate3d using offsetLeft/offsetTop.
    // width = vv.width = 1000px (NOT multiplied by scale)
    // height = vv.height = 800px
    // transform = translate3d(offsetLeft, offsetTop, 0) — NO scale()
    // position = fixed (not absolute)
    expect(modal.style.width).toBe("1000px");
    expect(modal.style.height).toBe("800px");
    expect(modal.style.transform).toBe("translate3d(100px, 50px, 0)");
    expect(modal.style.position).toBe("fixed");
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
