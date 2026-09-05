import { jest } from "@jest/globals";
import {
  state,
  publicState,
  updateConfig,
  getConfig,
  resetConfig,
  addCleanupFunction,
  runCleanupFunctions,
  addModalCleanupFunction,
  runModalCleanupFunctions,
} from "../src/core/config.js";

describe("Core Config", () => {
  beforeEach(() => {
    resetConfig();
  });

  test("updateConfig merges top-level values", () => {
    updateConfig({ accentColor: "#ff0000", layout: "floating" });
    expect(state.config.accentColor).toBe("#ff0000");
    expect(state.config.layout).toBe("floating");
    expect(state.config.diagramSelector).toBe(".diagram, .chart, [data-diagram]"); // Default preserved
  });

  test("updateConfig merges nested security values", () => {
    updateConfig({ security: { mode: "permissive" } });
    expect(state.config.security.mode).toBe("permissive");
    expect(state.config.security.allowOverrides).toBe(true); // Default preserved
  });

  test("updateConfig merges nested ui values", () => {
    updateConfig({ ui: { theme: "dark" } });
    expect(state.config.ui.theme).toBe("dark");
    expect(state.config.ui.buttons.style).toBe("accent"); // Default preserved
  });

  test("getConfig returns a copy", () => {
    const cfg = getConfig();
    cfg.accentColor = "blue";
    expect(state.config.accentColor).not.toBe("blue");
  });

  test("addCleanupFunction and runCleanupFunctions work", () => {
    const fn = jest.fn();
    addCleanupFunction(fn);
    runCleanupFunctions();
    expect(fn).toHaveBeenCalled();
    expect(state.cleanupFunctions.size).toBe(0);
  });

  test("runCleanupFunctions handles errors gracefully", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    addCleanupFunction(() => {
      throw new Error("Cleanup Boom");
    });
    expect(() => runCleanupFunctions()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("resetConfig resets state flags and arrays", () => {
    state.isInitialized = true;
    state.cleanupFunctions.add(() => {});
    resetConfig();
    expect(state.isInitialized).toBe(false);
    expect(state.cleanupFunctions.size).toBe(0);
  });

  test("updateConfig handles PDF library security", () => {
    updateConfig({ pdfLibraryUrl: "https://custom.js" });
    expect(state.config.pdfLibraryIntegrity).toBeNull();

    updateConfig({
      pdfLibraryUrl: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    });
    expect(state.config.pdfLibraryIntegrity).not.toBeNull();
  });

  test("modal cleanup functions work", () => {
    const fn = jest.fn();
    addModalCleanupFunction(fn);
    runModalCleanupFunctions();
    expect(fn).toHaveBeenCalled();
    expect(state.modalCleanupFunctions.size).toBe(0);
  });

  test("runModalCleanupFunctions handles errors gracefully", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    addModalCleanupFunction(() => {
      throw new Error("Modal Cleanup Boom");
    });
    expect(() => runModalCleanupFunctions()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("updateConfig handles empty/null input", () => {
    expect(() => updateConfig(null)).not.toThrow();
    expect(() => updateConfig({})).not.toThrow();
  });

  test("updateConfig warns on unknown keys", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ unknownKey: "value" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("Core Config: validateConfig gaps (review 2, finding 8)", () => {
  let warn;

  beforeEach(() => {
    resetConfig();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test.each([
    ["NaN", NaN],
    ["a string", "3"],
    ["null", null],
    ["Infinity", Infinity],
  ])("numeric keys reject %s and keep the previous value", (_label, value) => {
    updateConfig({ highResScale: 3 });
    warn.mockClear();

    updateConfig({ highResScale: value });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("highResScale"));
    expect(state.config.highResScale).toBe(3);
  });

  test("timing keys reject non-numbers", () => {
    updateConfig({ toastDuration: "fast" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("toastDuration"));
    expect(typeof state.config.toastDuration).toBe("number");
  });

  test.each([
    ["security", "off"],
    ["watermark", null],
    ["ui", 5],
    ["performance", []],
  ])("nested key %s cannot be replaced by a non-object", (key, value) => {
    const before = JSON.stringify(state.config[key]);

    updateConfig({ [key]: value });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(key));
    expect(JSON.stringify(state.config[key])).toBe(before);
  });

  test("nested objects are still merged, not replaced", () => {
    updateConfig({ security: { mode: "permissive" } });
    expect(state.config.security.mode).toBe("permissive");
    expect(state.config.security.allowOverrides).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  test("minZoomScale can never end up above maxZoomScale", () => {
    updateConfig({ minZoomScale: 0.5, maxZoomScale: 0.2 });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ZoomScale"));
    expect(state.config.minZoomScale).toBeLessThanOrEqual(state.config.maxZoomScale);

    warn.mockClear();
    updateConfig({ minZoomScale: 1, maxZoomScale: 1 }); // equal is allowed
    expect(warn).not.toHaveBeenCalled();
    expect(state.config.minZoomScale).toBe(1);
    expect(state.config.maxZoomScale).toBe(1);
  });

  test("allowedImageTypes must be an array of strings", () => {
    updateConfig({ allowedImageTypes: "png" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("allowedImageTypes"));
    expect(Array.isArray(state.config.allowedImageTypes)).toBe(true);

    warn.mockClear();
    updateConfig({ allowedImageTypes: ["png", 3] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("allowedImageTypes"));
    expect(state.config.allowedImageTypes.every((t) => typeof t === "string")).toBe(true);

    warn.mockClear();
    updateConfig({ allowedImageTypes: ["png"] });
    expect(warn).not.toHaveBeenCalled();
    expect(state.config.allowedImageTypes).toEqual(["png"]);
  });
});

describe("Core Config: publicState is read-only all the way down (review 2, finding 9)", () => {
  let warn;

  beforeEach(() => {
    resetConfig();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test("nested plain objects cannot be mutated through the public state", () => {
    publicState.touchState.isPinching = true;
    expect(state.touchState.isPinching).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("read-only"));

    warn.mockClear();
    delete publicState.touchState.isPinching;
    expect(state.touchState.isPinching).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("read-only"));

    // Values are still readable
    expect(publicState.touchState.isPinching).toBe(false);
  });

  test("Sets and Maps nested inside objects are snapshots", () => {
    publicState.asyncTasks.timeouts.add(123);
    expect(state.asyncTasks.timeouts.size).toBe(0);
    expect(publicState.asyncTasks.timeouts.has(123)).toBe(false);
  });

  test("events stays usable for on/off/emit but cannot be cleared from outside", () => {
    const internal = jest.fn();
    state.events.on("dv:internal", internal);

    // clear() is not offered (or is a no-op) on the public view
    if (typeof publicState.events.clear === "function") publicState.events.clear();
    state.events.emit("dv:internal");
    expect(internal).toHaveBeenCalledTimes(1);

    const external = jest.fn();
    const off = publicState.events.on("dv:external", external);
    publicState.events.emit("dv:external", 42);
    expect(external).toHaveBeenCalledWith(42);
    off();
    publicState.events.emit("dv:external");
    expect(external).toHaveBeenCalledTimes(1);
  });

  test("activePanzoom is exposed live", () => {
    const panzoom = { getScale: jest.fn(() => 2.5), destroy: jest.fn() };
    state.activePanzoom = panzoom;

    expect(publicState.activePanzoom).toBe(panzoom);
    expect(publicState.activePanzoom.getScale()).toBe(2.5);

    state.activePanzoom = null;
  });

  test("config groups are immutable through the public state", () => {
    // config is deep-frozen: strict-mode code throws, sloppy-mode code no-ops
    expect(() => {
      publicState.config.watermark.enabled = true;
    }).toThrow(TypeError);
    expect(state.config.watermark.enabled).toBe(false);
    expect(publicState.config.watermark.enabled).toBe(false);
  });
});
