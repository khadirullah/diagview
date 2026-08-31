/**
 * Regression tests for the v1.0.11 fixes:
 *  1. Two-stage Escape while searching (keyboard.js)
 *  2. closeModal re-entrancy guard (modal-controls.js)
 *  3. Gesture-scoped will-change on the panzoomed SVG (panzoom-integration.js)
 */
import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";

jest.unstable_mockModule("../src/ui/modal-controls.js", () => ({
  closeModal: jest.fn(),
  syncBrandingVisibility: jest.fn(),
  lockBodyScroll: jest.fn(),
  unlockBodyScroll: jest.fn(),
}));

const { closeModal: closeModalMock } = await import("../src/ui/modal-controls.js");
const { setupKeyboardShortcuts, teardownKeyboardShortcuts } =
  await import("../src/features/keyboard.js");
const { setupViewportInteractions } = await import("../src/features/panzoom-integration.js");

describe("Two-stage Escape while searching", () => {
  let searchInput;
  let backBtn;

  beforeEach(() => {
    resetConfig();
    state.isModalOpen = true;
    document.body.innerHTML = "";

    searchInput = document.createElement("input");
    searchInput.id = "diagview-search";
    document.body.appendChild(searchInput);

    backBtn = document.createElement("button");
    backBtn.id = "diagview-search-back";
    document.body.appendChild(backBtn);

    closeModalMock.mockClear();
    setupKeyboardShortcuts();
  });

  afterEach(() => {
    teardownKeyboardShortcuts();
  });

  const pressEscape = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  };

  test("Escape with a query in the focused search input does NOT close the modal", () => {
    searchInput.value = "deploy";
    searchInput.focus();

    pressEscape();

    expect(closeModalMock).not.toHaveBeenCalled();
  });

  test("Escape with an empty focused search input exits search mode, not the modal", () => {
    const backClick = jest.fn();
    backBtn.addEventListener("click", backClick);
    searchInput.value = "";
    searchInput.focus();

    pressEscape();

    expect(backClick).toHaveBeenCalledTimes(1);
    expect(closeModalMock).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(searchInput);
  });

  test("Escape outside of search closes the modal", () => {
    searchInput.blur();

    pressEscape();

    expect(closeModalMock).toHaveBeenCalledTimes(1);
  });
});

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
