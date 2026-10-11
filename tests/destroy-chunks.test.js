/**
 * destroy() resets the lazy chunks that have loaded and leaves the others
 * unloaded. Each mocked chunk records when it loads.
 */
import { jest } from "@jest/globals";

const loaded = [];
const cleanupMinimap = jest.fn();

jest.unstable_mockModule("../src/features/lazy/meeting-mode.js", () => {
  loaded.push("meeting mode");
  return { resetMeetingState: jest.fn(), toggleMeetingMode: jest.fn() };
});
jest.unstable_mockModule("../src/features/lazy/minimap.js", () => {
  loaded.push("minimap");
  return { cleanupMinimap, updateMinimap: jest.fn(), refreshMinimapColour: jest.fn() };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
});

document.documentElement.setAttribute("data-diagview-no-auto-init", "");
const { init, destroy } = await import("../src/index.js");
const { loadChunk } = await import("../src/core/lifecycle.js");

describe("destroy() and the lazy chunks", () => {
  test("a chunk that never loaded stays unloaded", async () => {
    init();
    await destroy();
    expect(loaded).toEqual([]);
  });

  test("a chunk that has loaded gets its cleanup", async () => {
    init();
    await loadChunk("minimap", () => import("../src/features/lazy/minimap.js"));
    await destroy();
    expect(loaded).toEqual(["minimap"]);
    expect(cleanupMinimap).toHaveBeenCalledTimes(1);
  });
});
