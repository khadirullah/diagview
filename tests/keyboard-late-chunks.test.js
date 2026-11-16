/**
 * M and L load their feature on the first press. The viewer can close, or a
 * new one can open, before that code arrives. The late code must then leave
 * the page and the newer viewer alone.
 */
import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";

const toggleMeetingMode = jest.fn();
const shareLink = jest.fn();

jest.unstable_mockModule("../src/features/lazy/meeting-mode.js", () => ({
  toggleMeetingMode,
  cleanupMeetingMode: jest.fn(),
}));
jest.unstable_mockModule("../src/features/lazy/share.js", () => ({
  shareLink,
}));
jest.unstable_mockModule("../src/ui/modal-controls.js", () => ({
  closeModal: jest.fn(),
}));

const { setupKeyboardShortcuts, teardownKeyboardShortcuts } =
  await import("../src/features/keyboard.js");

// The mocked chunk resolves over a few microtask turns
const chunkLoaded = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("M and L when the viewer changes while their code loads", () => {
  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    toggleMeetingMode.mockClear();
    shareLink.mockClear();
    state.activePanzoom = { pan: jest.fn() };
    state.isModalOpen = true;
    setupKeyboardShortcuts();
  });

  afterEach(() => {
    teardownKeyboardShortcuts();
    resetConfig();
  });

  const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key }));

  test.each([
    ["m", toggleMeetingMode],
    ["l", shareLink],
  ])("%s acts when the same viewer is still open", async (key, action) => {
    press(key);
    await chunkLoaded();
    expect(action).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["m", toggleMeetingMode],
    ["l", shareLink],
  ])("%s does nothing after the viewer closed", async (key, action) => {
    press(key);
    state.isModalOpen = false;
    state.activePanzoom = null;
    await chunkLoaded();
    expect(action).not.toHaveBeenCalled();
  });

  test.each([
    ["m", toggleMeetingMode],
    ["l", shareLink],
  ])("%s does nothing to a viewer opened after the press", async (key, action) => {
    press(key);
    state.activePanzoom = { pan: jest.fn() };
    await chunkLoaded();
    expect(action).not.toHaveBeenCalled();
  });
});
