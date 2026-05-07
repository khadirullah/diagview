import { jest } from "@jest/globals";
import {
  state,
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
