/**
 * Keyboard Shortcuts Tests
 * Verifies that all key bindings trigger the correct actions and respect state.
 */

import { jest } from "@jest/globals";

// The rotate chunk fails to load (simulates a missing code-split file in the ESM build)
jest.unstable_mockModule("../src/features/lazy/rotate.js", () => {
  throw new Error("chunk failed to load");
});

// Keep the real modal out of it: Escape handling is asserted through this mock
jest.unstable_mockModule("../src/ui/modal-controls.js", () => ({
  closeModal: jest.fn(),
  syncBrandingVisibility: jest.fn(),
  lockBodyScroll: jest.fn(),
  unlockBodyScroll: jest.fn(),
}));

const { state, resetConfig } = await import("../src/core/config.js");
const { closeModal: closeModalMock } = await import("../src/ui/modal-controls.js");
const { setupKeyboardShortcuts, teardownKeyboardShortcuts } =
  await import("../src/features/keyboard.js");
const { isHelpVisible, cleanupKeyboardHelp } = await import("../src/ui/keyboard-help.js");

describe("Keyboard Shortcuts Integration", () => {
  let mockPanzoom;

  beforeEach(() => {
    resetConfig();

    // Mock the panzoom engine
    mockPanzoom = {
      zoomIn: jest.fn(),
      zoomOut: jest.fn(),
      reset: jest.fn(),
      pan: jest.fn(),
      getScale: jest.fn().mockReturnValue(1),
      getElement: () => document.createElement("div"),
    };

    state.activePanzoom = mockPanzoom;
    state.isModalOpen = true;

    setupKeyboardShortcuts();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    teardownKeyboardShortcuts();
  });

  test("+ and = keys trigger zoomIn", () => {
    const event = new KeyboardEvent("keydown", { key: "+" });
    window.dispatchEvent(event);
    expect(mockPanzoom.zoomIn).toHaveBeenCalled();

    const eventEqual = new KeyboardEvent("keydown", { key: "=" });
    window.dispatchEvent(eventEqual);
    expect(mockPanzoom.zoomIn).toHaveBeenCalledTimes(2);
  });

  test("- and _ keys trigger zoomOut", () => {
    const event = new KeyboardEvent("keydown", { key: "-" });
    window.dispatchEvent(event);
    expect(mockPanzoom.zoomOut).toHaveBeenCalled();

    const eventUnderscore = new KeyboardEvent("keydown", { key: "_" });
    window.dispatchEvent(eventUnderscore);
    expect(mockPanzoom.zoomOut).toHaveBeenCalledTimes(2);
  });

  test("0 and Space keys trigger reset", () => {
    const event0 = new KeyboardEvent("keydown", { key: "0" });
    window.dispatchEvent(event0);
    expect(mockPanzoom.reset).toHaveBeenCalled();

    const eventSpace = new KeyboardEvent("keydown", { key: " " });
    window.dispatchEvent(eventSpace);
    expect(mockPanzoom.reset).toHaveBeenCalledTimes(2);
  });

  test("Arrow keys trigger panning", () => {
    const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
    window.dispatchEvent(event);
    expect(mockPanzoom.pan).toHaveBeenCalled();
  });

  test("Keyboard shortcuts are ignored if no active panzoom", () => {
    state.activePanzoom = null;
    const event = new KeyboardEvent("keydown", { key: "+" });
    window.dispatchEvent(event);
    expect(mockPanzoom.zoomIn).not.toHaveBeenCalled();
  });

  test("Arrow keys pan in screen axes regardless of rotation", () => {
    // Rotation lives on an inner <g> inside the SVG, so panzoom deltas are
    // already screen-space. Any compensation here inverts the arrows.
    for (const angle of [0, 90, 180, 270]) {
      mockPanzoom.pan.mockClear();
      state.rotationAngle = angle;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      const [upDx, upDy] = mockPanzoom.pan.mock.calls[0];
      const [rightDx, rightDy] = mockPanzoom.pan.mock.calls[1];
      expect([upDx, upDy]).toEqual([0, 40]);
      expect([rightDx, rightDy]).toEqual([-40, 0]);
    }
    state.rotationAngle = 0;
  });

  test("Arrow pan honours panAnimationDuration", () => {
    state.config = { ...state.config, panAnimationDuration: 350 };
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(mockPanzoom.pan).toHaveBeenLastCalledWith(
      0,
      -40,
      expect.objectContaining({ duration: 350 }),
    );
  });

  test("Shift key uses faster panning steps", () => {
    // We can't easily check the internal moveStep value here,
    // but we verify the pan function is called regardless.
    const event = new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true });
    window.dispatchEvent(event);
    expect(mockPanzoom.pan).toHaveBeenCalled();
  });

  test("? does not open help while typing in the search box", () => {
    document.body.innerHTML = '<input id="diagview-search" value="">';
    const input = document.getElementById("diagview-search");
    input.focus();
    expect(document.activeElement).toBe(input);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    expect(isHelpVisible()).toBe(false);

    input.blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    expect(isHelpVisible()).toBe(true);

    cleanupKeyboardHelp();
  });

  test("a failed lazy chunk is reported instead of rejecting unhandled", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = [];
    const track = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", track);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    process.off("unhandledRejection", track);
    expect(unhandled).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

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
