/**
 * SVG Cloning Tests
 * Verifies style baking, text preservation, and deep cloning logic.
 */

import { jest } from "@jest/globals";
import { cloneSVG, cloneSVGForModal, cloneSVGForExport } from "../src/core/svg-clone.js";

describe("SVG Cloning Utilities", () => {
  let originalSvg;

  beforeEach(() => {
    document.body.innerHTML = "";

    // Create a realistic SVG structure
    originalSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    originalSvg.setAttribute("viewBox", "0 0 100 100");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("fill", "red");
    rect.className.baseVal = "test-rect";
    originalSvg.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "Hello World";
    originalSvg.appendChild(text);

    document.body.appendChild(originalSvg);

    // Mock getComputedStyle to simulate browser behavior
    window.getComputedStyle = jest.fn().mockReturnValue({
      getPropertyValue: jest.fn((prop) => {
        if (prop === "fill") return "rgb(255, 0, 0)";
        if (prop === "font-size") return "14px";
        return "none";
      }),
    });

    // Mock getBBox for text dimension calculation
    SVGElement.prototype.getBBox = jest.fn().mockReturnValue({
      x: 0,
      y: 0,
      width: 80,
      height: 20,
    });
  });

  test("cloneSVG creates a separate deep copy", () => {
    const clone = cloneSVG(originalSvg);
    expect(clone).not.toBe(originalSvg);
    expect(clone.querySelectorAll("rect")).toHaveLength(1);
    expect(clone.querySelectorAll("text")).toHaveLength(1);
  });

  test("cloneSVGForModal preserves text dimensions but skips style baking", () => {
    const clone = cloneSVGForModal(originalSvg);
    const clonedRect = clone.querySelector("rect");
    const clonedText = clone.querySelector("text");

    // Should have textLength (from our BBox mock)
    expect(clonedText.getAttribute("textLength")).toBe("80");

    // Should NOT have inline fill (modal clone is optimized to skip this)
    expect(clonedRect.style.fill).toBe("");
  });

  test("cloneSVGForExport bakes computed styles into inline styles", () => {
    const clone = cloneSVGForExport(originalSvg);
    const clonedRect = clone.querySelector("rect");

    // Should HAVE inline fill (export clone bakes styles)
    expect(clonedRect.style.fill).toBe("rgb(255, 0, 0)");
  });

  test("cloneSVG correctly handles missing input", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = cloneSVG(null);
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
