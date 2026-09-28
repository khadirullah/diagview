/**
 * Viewport Module Tests
 * Tests history state management and verifies viewport meta functions are removed.
 */

import { jest } from "@jest/globals";
import {
  pushModalHistoryState,
  cleanupModalHistoryState,
  resetViewportState,
} from "../src/ui/viewport.js";
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

describe("History state across a quick close and reopen", () => {
  const popstate = () => new Promise((r) => window.addEventListener("popstate", r, { once: true }));

  beforeEach(() => {
    resetViewportState();
    state.isModalOpen = false;
  });

  afterEach(() => {
    state.isModalOpen = false;
    resetViewportState();
  });

  test("a reopen during the pending back() pushes its entry once back() settles", async () => {
    const first = jest.fn();
    const second = jest.fn();
    state.isModalOpen = true;
    pushModalHistoryState(first);
    const lengthOpen = history.length;

    // Close, then reopen before the async back() has landed
    state.isModalOpen = false;
    const settled = popstate();
    cleanupModalHistoryState();
    state.isModalOpen = true;
    pushModalHistoryState(second);
    await settled;

    expect(history.state).toEqual({ diagviewModal: true });
    expect(history.length).toBe(lengthOpen);
    // The stale popstate from the close did not close the new session
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    // Back now closes the reopened viewer
    const back = popstate();
    history.back();
    await back;
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("a push deferred by a reopen is dropped when that session closes first", async () => {
    state.isModalOpen = true;
    pushModalHistoryState(jest.fn());

    state.isModalOpen = false;
    const settled = popstate();
    cleanupModalHistoryState();
    state.isModalOpen = true;
    pushModalHistoryState(jest.fn());
    state.isModalOpen = false;
    cleanupModalHistoryState();
    await settled;

    expect(history.state?.diagviewModal).toBeUndefined();
  });

  test("the lock still lifts on the timeout when no popstate arrives", () => {
    jest.useFakeTimers();
    try {
      const back = jest.spyOn(history, "back").mockImplementation(() => {});
      state.isModalOpen = true;
      pushModalHistoryState(jest.fn());
      state.isModalOpen = false;
      cleanupModalHistoryState();
      back.mockRestore();

      const pushSpy = jest.spyOn(history, "pushState");
      state.isModalOpen = true;
      pushModalHistoryState(jest.fn());
      expect(pushSpy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(pushSpy).toHaveBeenCalledTimes(1);
      pushSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
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

  describe("narrow screen class", () => {
    const layoutWidth = (w) =>
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: w,
      });
    const syncHandler = () =>
      window.visualViewport.addEventListener.mock.calls.find(([t]) => t === "resize")[1];

    afterEach(async () => {
      delete document.documentElement.clientWidth;
      (await import("../src/ui/viewport.js")).stopVisualViewportSync();
    });

    test("is set on a page laid out wide but shown zoomed out to a phone's width", async () => {
      const { startVisualViewportSync, stopVisualViewportSync } =
        await import("../src/ui/viewport.js");
      layoutWidth(980);
      Object.assign(window.visualViewport, { width: 980, scale: 390 / 980 });
      startVisualViewportSync();
      expect(modal.classList.contains("dv-narrow")).toBe(true);

      stopVisualViewportSync();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
    });

    test("is dropped when the phone turns to a wide landscape screen", async () => {
      const { startVisualViewportSync } = await import("../src/ui/viewport.js");
      layoutWidth(980);
      Object.assign(window.visualViewport, { width: 980, scale: 390 / 980 });
      startVisualViewportSync();
      Object.assign(window.visualViewport, { width: 980, scale: 844 / 980 });
      syncHandler()();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
    });

    test("is never set on a phone page with a viewport meta tag", async () => {
      const { startVisualViewportSync } = await import("../src/ui/viewport.js");
      layoutWidth(390);
      Object.assign(window.visualViewport, { width: 390, scale: 1 });
      startVisualViewportSync();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
      Object.assign(window.visualViewport, { width: 130, scale: 3 });
      syncHandler()();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
    });

    test("is never set on desktop, also when pinch-zoomed", async () => {
      const { startVisualViewportSync } = await import("../src/ui/viewport.js");
      layoutWidth(1280);
      Object.assign(window.visualViewport, { width: 1280, scale: 1 });
      startVisualViewportSync();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
      Object.assign(window.visualViewport, { width: 320, scale: 4 });
      syncHandler()();
      expect(modal.classList.contains("dv-narrow")).toBe(false);
    });
  });
});
