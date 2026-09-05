/**
 * Icons Tests
 * The icon set must contain exactly what the UI references.
 */
import { ICONS } from "../src/ui/icons.js";

describe("ICONS contains only referenced icons", () => {
  test("exactly the icons used by the UI are exported", () => {
    expect(Object.keys(ICONS).sort()).toEqual(
      [
        "close",
        "copy",
        "dl",
        "fs",
        "laser",
        "menu",
        "reset",
        "rotate",
        "search",
        "share",
        "textSelect",
      ].sort(),
    );
  });
});
