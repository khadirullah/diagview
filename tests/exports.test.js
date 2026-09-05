/**
 * The UMD build attaches every *named* export of src/index.js to the
 * window.DiagView global (Rollup `exports: "named"`). Members that only live
 * on the default export object are therefore invisible to script-tag users.
 * This guards that the documented surface exists as named exports too.
 */
import * as mod from "../src/index.js";

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
