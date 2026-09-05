/**
 * Panzoom Integration Tests
 * Gesture-scoped will-change hint and touch (pinch / double-tap) handling.
 */
import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import { setupViewportInteractions, resetTouchState } from "../src/features/panzoom-integration.js";

describe("Gesture-scoped will-change", () => {
  let viewport;
  let element;
  let panzoom;

  beforeEach(() => {
    jest.useFakeTimers();
    resetConfig();
    state.isModalOpen = true;
    document.body.innerHTML = "";

    viewport = document.createElement("div");
    element = document.createElement("div");
    document.body.appendChild(viewport);
    viewport.appendChild(element);

    panzoom = {
      zoomWithWheel: jest.fn(),
      reset: jest.fn(),
      getScale: jest.fn(() => 1),
    };

    setupViewportInteractions(viewport, element, panzoom);
  });

  afterEach(() => {
    // Run modal-scoped cleanups registered by setupViewportInteractions
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
    jest.useRealTimers();
  });

  test("mousedown promotes the SVG to a compositor layer", () => {
    viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(element.style.willChange).toBe("transform");
  });

  test("hint is released after the cooldown so the browser re-rasterizes sharp", () => {
    viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(element.style.willChange).toBe("transform");

    jest.advanceTimersByTime(500);
    expect(element.style.willChange).toBe("");
  });

  test("panzoomchange (any transform source) re-arms and extends the cooldown", () => {
    element.dispatchEvent(new CustomEvent("panzoomchange"));
    expect(element.style.willChange).toBe("transform");

    // Keep the gesture alive past the original cooldown
    jest.advanceTimersByTime(300);
    element.dispatchEvent(new CustomEvent("panzoomchange"));
    jest.advanceTimersByTime(300);
    expect(element.style.willChange).toBe("transform");

    jest.advanceTimersByTime(200);
    expect(element.style.willChange).toBe("");
  });

  test("modal cleanup clears the hint and pending timer", () => {
    viewport.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(element.style.willChange).toBe("transform");

    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    expect(element.style.willChange).toBe("");
  });
});

describe("touch: tap after pinch does not reset the zoom", () => {
  let viewport, element, panzoom;

  const touch = (type, count) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    ev.touches = Array.from({ length: count }, (_, i) => ({ clientX: i * 50, clientY: 0 }));
    viewport.dispatchEvent(ev);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    resetConfig();
    resetTouchState();
    state.isModalOpen = true;
    document.body.innerHTML = "";
    viewport = document.createElement("div");
    element = document.createElement("div");
    viewport.appendChild(element);
    document.body.appendChild(viewport);
    panzoom = {
      zoomWithWheel: jest.fn(),
      reset: jest.fn(),
      getScale: jest.fn(() => 1),
    };
    setupViewportInteractions(viewport, element, panzoom);
  });

  afterEach(() => {
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
    state.isModalOpen = false;
    jest.useRealTimers();
  });

  test("pinch end followed by a single tap within 300 ms does not reset", () => {
    touch("touchstart", 2);
    touch("touchend", 0); // pinch finished
    expect(state.touchState.isPinching).toBe(false);

    jest.advanceTimersByTime(120);
    touch("touchstart", 1);
    touch("touchend", 0); // a lone tap

    expect(panzoom.reset).not.toHaveBeenCalled();
  });

  test("a real double tap still resets", () => {
    touch("touchstart", 1);
    touch("touchend", 0);
    jest.advanceTimersByTime(120);
    touch("touchstart", 1);
    touch("touchend", 0);

    expect(panzoom.reset).toHaveBeenCalledTimes(1);
  });
});
