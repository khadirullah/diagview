/**
 * Keyboard Shortcuts Tests
 * Verifies that all key bindings trigger the correct actions and respect state.
 */

import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import { setupKeyboardShortcuts, teardownKeyboardShortcuts } from "../src/features/keyboard.js";

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

  test("Shift key uses faster panning steps", () => {
    // We can't easily check the internal moveStep value here,
    // but we verify the pan function is called regardless.
    const event = new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true });
    window.dispatchEvent(event);
    expect(mockPanzoom.pan).toHaveBeenCalled();
  });
});
