/**
 * Panzoom Integration Tests
 * Gesture-scoped will-change hint and touch (pinch / double-tap) handling.
 */
import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import {
  initializePanzoom,
  setupViewportInteractions,
  resetTouchState,
} from "../src/features/panzoom-integration.js";

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

describe("taps reach links and click handlers", () => {
  let handleStartEvent;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = `
      <svg>
        <a href="#a"><rect id="link"/></a>
        <a xlink:href="#b"><rect id="xlink"/></a>
        <g onclick="void 0"><g><rect id="handler"/></g></g>
        <rect id="shape"/>
      </svg>`;
    window.Panzoom = jest.fn((el, opts) => {
      handleStartEvent = opts.handleStartEvent;
      return {};
    });
    initializePanzoom(document.querySelector("svg"));
  });

  afterEach(() => {
    delete window.Panzoom;
  });

  // Runs handleStartEvent and reports whether it cancelled the pointerdown
  const cancels = (pointerType, id) => {
    const e = {
      pointerType,
      target: document.getElementById(id),
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    handleStartEvent(e);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    return e.preventDefault.mock.calls.length > 0;
  };

  test("mouse on a link still cancels pointerdown", () => {
    expect(cancels("mouse", "link")).toBe(true);
  });

  test("touch on a link does not cancel pointerdown", () => {
    expect(cancels("touch", "link")).toBe(false);
  });

  test("touch on an xlink:href link does not cancel pointerdown", () => {
    expect(cancels("touch", "xlink")).toBe(false);
  });

  test("touch inside an onclick element does not cancel pointerdown", () => {
    expect(cancels("touch", "handler")).toBe(false);
  });

  test("touch on a plain shape cancels pointerdown", () => {
    expect(cancels("touch", "shape")).toBe(true);
  });

  test("pen on a link does not cancel pointerdown", () => {
    expect(cancels("pen", "link")).toBe(false);
  });

  test("a caller's own handleStartEvent still wins", () => {
    const own = jest.fn();
    initializePanzoom(document.querySelector("svg"), { handleStartEvent: own });
    expect(handleStartEvent).toBe(own);
  });
});

describe("click after a mouse drag", () => {
  let viewport, link, onNavigate;

  const pointer = (type, x, pointerType = "mouse") =>
    viewport.dispatchEvent(
      Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 }), {
        isPrimary: true,
        pointerType,
      }),
    );
  const click = (detail = 1) => {
    const e = new MouseEvent("click", { bubbles: true, cancelable: true, detail });
    link.dispatchEvent(e);
    return e;
  };

  beforeEach(() => {
    resetConfig();
    state.isModalOpen = true;
    document.body.innerHTML = "";
    viewport = document.createElement("div");
    const element = document.createElement("div");
    link = document.createElement("a");
    link.href = "#opened";
    onNavigate = jest.fn();
    link.addEventListener("click", onNavigate);
    element.appendChild(link);
    viewport.appendChild(element);
    document.body.appendChild(viewport);
    setupViewportInteractions(viewport, element, { reset: jest.fn(), zoomWithWheel: jest.fn() });
  });

  afterEach(() => {
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
  });

  test("swallows the click that ends a pan", () => {
    pointer("pointerdown", 10);
    pointer("pointerup", 160);
    const e = click();
    expect(e.defaultPrevented).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test("swallows only one click", () => {
    pointer("pointerdown", 10);
    pointer("pointerup", 160);
    click();
    click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("lets a plain click through, including a small wobble", () => {
    pointer("pointerdown", 10);
    pointer("pointerup", 13);
    const e = click();
    expect(e.defaultPrevented).toBe(false);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("lets keyboard clicks through after a drag", () => {
    pointer("pointerdown", 10);
    pointer("pointerup", 160);
    click(0);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("a tap after a finger pan that fired no click still opens the link", () => {
    pointer("pointerdown", 10, "touch");
    pointer("pointerup", 160, "touch");
    pointer("pointerdown", 40, "touch");
    pointer("pointerup", 40, "touch");
    click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("closing the viewer removes the listener", () => {
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    pointer("pointerdown", 10);
    pointer("pointerup", 160);
    click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("zoomAnimationDuration", () => {
  afterEach(() => {
    delete window.Panzoom;
    resetConfig();
  });

  test("0 zooms without animation", () => {
    window.Panzoom = jest.fn(() => ({}));
    state.config = { ...state.config, zoomAnimationDuration: 0 };
    initializePanzoom(document.createElement("div"));
    expect(window.Panzoom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 0 }),
    );
  });
});
