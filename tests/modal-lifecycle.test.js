/**
 * Modal Lifecycle Tests
 * Tests the managed event listener system and cleanup function infrastructure
 * that underpins the fullscreenchange and resize listener fixes.
 */

import { jest } from "@jest/globals";
import { state, resetConfig, addCleanupFunction, runCleanupFunctions } from "../src/core/config.js";
import { addManagedListener } from "../src/core/lifecycle.js";

describe("Managed Event Listeners", () => {
  beforeEach(() => {
    resetConfig();
  });

  test("addManagedListener attaches handler and returns cleanup", () => {
    const handler = jest.fn();
    const target = document.createElement("div");
    const cleanup = addManagedListener(target, "click", handler);

    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    // After manual cleanup, handler should no longer fire
    cleanup();
    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("addManagedListener registers cleanup for auto-removal", () => {
    const handler = jest.fn();
    const target = document.createElement("div");
    addManagedListener(target, "click", handler);

    // Cleanup should be registered in state
    expect(state.cleanupFunctions.length).toBeGreaterThan(0);

    // Running cleanup removes the listener
    runCleanupFunctions();
    target.dispatchEvent(new Event("click"));
    expect(handler).not.toHaveBeenCalled();
  });

  test("addManagedListener returns noop for invalid arguments", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = addManagedListener(null, "click", jest.fn());

    expect(typeof cleanup).toBe("function");
    cleanup(); // should not throw
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("Cleanup Function System", () => {
  beforeEach(() => {
    resetConfig();
  });

  test("runCleanupFunctions executes all and clears array", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();
    const fn3 = jest.fn();

    addCleanupFunction(fn1);
    addCleanupFunction(fn2);
    addCleanupFunction(fn3);
    expect(state.cleanupFunctions).toHaveLength(3);

    runCleanupFunctions();

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn3).toHaveBeenCalledTimes(1);
    expect(state.cleanupFunctions).toEqual([]);
  });

  test("runCleanupFunctions handles errors without stopping", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const fn1 = jest.fn(() => {
      throw new Error("test error");
    });
    const fn2 = jest.fn();

    addCleanupFunction(fn1);
    addCleanupFunction(fn2);

    runCleanupFunctions();

    // fn1 threw, but fn2 should still execute
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("addCleanupFunction ignores non-functions", () => {
    addCleanupFunction("not a function");
    addCleanupFunction(null);
    addCleanupFunction(42);
    expect(state.cleanupFunctions).toEqual([]);
  });
});
