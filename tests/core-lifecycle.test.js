import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import {
  safeDestroy,
  addManagedListener,
  addModalListener,
  registerTimeout,
  registerRAF,
  clearAsyncTasks,
} from "../src/core/lifecycle.js";

describe("Core Lifecycle Utilities", () => {
  beforeEach(() => {
    resetConfig();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("safeDestroy calls the method", () => {
    const mock = { destroy: jest.fn() };
    expect(safeDestroy(mock)).toBe(true);
    expect(mock.destroy).toHaveBeenCalled();
  });

  test("safeDestroy handles missing method", () => {
    const mock = {};
    expect(safeDestroy(mock)).toBe(false);
  });

  test("safeDestroy handles custom method name", () => {
    const mock = { disconnect: jest.fn() };
    expect(safeDestroy(mock, "disconnect")).toBe(true);
    expect(mock.disconnect).toHaveBeenCalled();
  });

  test("safeDestroy handles errors", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mock = {
      destroy: () => {
        throw new Error("Boom");
      },
    };
    expect(safeDestroy(mock)).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("addManagedListener adds and cleans up", () => {
    const target = document.createElement("div");
    const handler = jest.fn();
    const cleanup = addManagedListener(target, "click", handler);

    target.dispatchEvent(new MouseEvent("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    target.dispatchEvent(new MouseEvent("click"));
    expect(handler).toHaveBeenCalledTimes(1); // Not called second time
  });

  test("addModalListener adds and cleans up", () => {
    const target = document.createElement("div");
    const handler = jest.fn();
    const cleanup = addModalListener(target, "click", handler);

    target.dispatchEvent(new MouseEvent("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    target.dispatchEvent(new MouseEvent("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("registerTimeout adds to state and cleans up", () => {
    const fn = jest.fn();
    registerTimeout(state, fn, 100);
    expect(state.asyncTasks.timeouts.size).toBe(1);

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalled();
    expect(state.asyncTasks.timeouts.size).toBe(0);
  });

  test("registerRAF adds to state and cleans up", () => {
    const fn = jest.fn();
    registerRAF(state, fn);
    expect(state.asyncTasks.rafs.size).toBe(1);

    jest.advanceTimersByTime(16); // Trigger RAF in JSDOM
    expect(fn).toHaveBeenCalled();
    expect(state.asyncTasks.rafs.size).toBe(0);
  });

  test("clearAsyncTasks clears everything", () => {
    registerTimeout(state, () => {}, 100);
    registerRAF(state, () => {});

    expect(state.asyncTasks.timeouts.size).toBe(1);
    expect(state.asyncTasks.rafs.size).toBe(1);

    clearAsyncTasks(state);

    expect(state.asyncTasks.timeouts.size).toBe(0);
    expect(state.asyncTasks.rafs.size).toBe(0);
  });

  test("addManagedListener warns on invalid arguments", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    addManagedListener(null, null, null);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
