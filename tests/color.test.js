/**
 * @jest-environment node
 */

/**
 * Colour Maths Tests
 * The colour helpers run without a DOM for hex and rgb() colours.
 */

import {
  getLuminance,
  parseColor,
  getContrastRatio,
  colorAlpha,
  overPage,
  mutedText,
} from "../src/core/color.js";

describe("color maths without a DOM", () => {
  test("parses hex and rgb() colours", () => {
    expect(parseColor("#f00")).toEqual([255, 0, 0]);
    expect(parseColor("#00ff0080")).toEqual([0, 255, 0]);
    expect(parseColor("rgb(-10, 300, 12.6)")).toEqual([0, 255, 13]);
  });

  test("returns null for a named colour when there is no browser to ask", () => {
    expect(parseColor("red")).toBeNull();
  });

  test("measures luminance and contrast", () => {
    expect(getLuminance(255, 255, 255)).toBeCloseTo(1);
    expect(getLuminance(0, 0, 0)).toBe(0);
    expect(getContrastRatio("#000", "#fff")).toBeCloseTo(21);
    expect(getContrastRatio("not a colour", "#fff")).toBe(1);
  });

  test("reads the alpha channel", () => {
    expect(colorAlpha("transparent")).toBe(0);
    expect(colorAlpha("#0008")).toBeCloseTo(0x88 / 255);
    expect(colorAlpha("rgba(0, 0, 0, 0.25)")).toBe(0.25);
    expect(colorAlpha("rgb(0 0 0 / 50%)")).toBe(0.5);
    expect(colorAlpha("#123456")).toBe(1);
  });

  test("mixes a see-through colour over the page", () => {
    expect(overPage("#123456", "#fff")).toBe("#123456");
    expect(overPage("rgba(0, 0, 0, 0.5)", "#fff")).toBe("rgb(128, 128, 128)");
  });

  test("fades text toward the background while it keeps 4.5:1", () => {
    const muted = mutedText("#000", "#fff");
    expect(muted).not.toBe("#000");
    expect(getContrastRatio(muted, "#fff")).toBeGreaterThanOrEqual(4.5);
  });
});
