/**
 * The UMD build (src/umd.js) exposes the default DiagView object as the
 * window.DiagView global and as require("diagview"). The ESM build keeps the
 * named exports. This guards that both carry the same documented surface.
 */
import * as mod from "../src/index.js";
import umd from "../src/umd.js";

describe("Named exports match the documented DiagView surface", () => {
  test("state and utils are named exports, identical to the default object's", () => {
    expect(mod.state).toBeDefined();
    expect(mod.state).toBe(mod.default.state);
    expect(mod.utils).toBeDefined();
    expect(mod.utils).toBe(mod.default.utils);
    expect(typeof mod.utils.sanitizeSVG).toBe("function");
  });

  test("every function on the default object is also a named export", () => {
    for (const [key, value] of Object.entries(mod.default)) {
      if (typeof value !== "function") continue;
      expect(mod[key]).toBe(value);
    }
  });

  test("version is exported by name", () => {
    expect(typeof mod.version).toBe("string");
    expect(mod.version).toBe(mod.default.version);
  });
});

describe("UMD entry", () => {
  test("exports the DiagView object with every named export and no default key", () => {
    expect(umd).toBe(mod.default);
    const names = Object.keys(mod).filter((key) => key !== "default");
    expect(Object.keys(umd).sort()).toEqual(names.sort());
  });

  test("keeps .default pointing at itself for older code", () => {
    expect(umd.default).toBe(umd);
  });
});
