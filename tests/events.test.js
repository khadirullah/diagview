import { jest } from "@jest/globals";
import { EventEmitter } from "../src/core/events.js";

describe("EventEmitter", () => {
  let events;

  beforeEach(() => {
    events = EventEmitter();
  });

  test("should register and emit events", () => {
    const callback = jest.fn();
    events.on("test", callback);
    events.emit("test", { data: "foo" });
    expect(callback).toHaveBeenCalledWith({ data: "foo" });
  });

  test("should handle multiple listeners", () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    events.on("test", cb1);
    events.on("test", cb2);
    events.emit("test");
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  test("should remove listeners with off", () => {
    const callback = jest.fn();
    events.on("test", callback);
    events.off("test", callback);
    events.emit("test");
    expect(callback).not.toHaveBeenCalled();
  });

  test("should not fail when removing non-existent listener", () => {
    expect(() => {
      events.off("non-existent", () => {});
    }).not.toThrow();
  });

  test("should not fail when removing non-existent listener from existing event", () => {
    events.on("test", () => {});
    expect(() => {
      events.off("test", () => {});
    }).not.toThrow();
  });

  test("should not fail when emitting event with no listeners", () => {
    expect(() => {
      events.emit("no-listeners");
    }).not.toThrow();
  });

  test("should handle errors in listeners gracefully", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const badCallback = () => {
      throw new Error("Boom");
    };
    const goodCallback = jest.fn();

    events.on("test", badCallback);
    events.on("test", goodCallback);

    events.emit("test");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DiagView: Error in event listener for "test":'),
      expect.any(Error),
    );
    expect(goodCallback).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("should prevent concurrent modification issues during emit", () => {
    const results = [];
    const cb1 = () => {
      results.push(1);
      events.off("test", cb2); // Try to remove cb2 while emitting
    };
    const cb2 = () => {
      results.push(2);
    };

    events.on("test", cb1);
    events.on("test", cb2);

    events.emit("test");

    // cb2 should still run because we snapshot listeners before loop
    expect(results).toEqual([1, 2]);
  });

  test("should clear all listeners", () => {
    const callback = jest.fn();
    events.on("test", callback);
    events.clear();
    events.emit("test");
    expect(callback).not.toHaveBeenCalled();
  });
});
