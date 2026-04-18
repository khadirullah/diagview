/**
 * Viewport Module Tests
 * Tests history state management and verifies viewport meta functions are removed.
 */

import { jest } from "@jest/globals";
import {
  pushModalHistoryState,
  cleanupModalHistoryState,
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

describe("Viewport Meta Functions Removed", () => {
  test("module does not export resetViewportZoom", async () => {
    const mod = await import("../src/ui/viewport.js");
    expect(mod.resetViewportZoom).toBeUndefined();
  });

  test("module does not export restoreViewportZoom", async () => {
    const mod = await import("../src/ui/viewport.js");
    expect(mod.restoreViewportZoom).toBeUndefined();
  });
});
