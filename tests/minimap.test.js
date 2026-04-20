/**
 * Minimap Visibility Logic Tests
 * Verifies the coordinate-space fix (getBoundingClientRect vs baseVal)
 * and ensures correct minimap behavior across browser zoom levels.
 */

import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import { updateMinimap } from "../src/features/lazy/minimap.js";

// Helper: create element with mocked getBoundingClientRect
function mockElement(rect, viewBox) {
  const el = document.createElement("div");
  el.getBoundingClientRect = jest.fn(() => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: rect.width,
    bottom: rect.height,
    ...rect,
  }));
  if (viewBox) {
    Object.defineProperty(el, "viewBox", {
      value: { baseVal: viewBox },
      configurable: true,
    });
  }
  el.cloneNode = jest.fn(() => {
    const c = document.createElement("div");
    c.style.cssText = "";
    return c;
  });
  return el;
}

function mockPanzoom(scale = 1, pan = { x: 0, y: 0 }) {
  return { getScale: () => scale, getPan: () => pan };
}

describe("Minimap Visibility Logic", () => {
  let minimap;

  beforeEach(() => {
    resetConfig();
    state.minimapSvg = null;

    minimap = document.createElement("div");
    minimap.id = "diagview-minimap";
    const indicator = document.createElement("div");
    indicator.className = "dv-mm-v";
    minimap.appendChild(indicator);
    document.body.appendChild(minimap);
    minimap.getBoundingClientRect = jest.fn(() => ({
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      top: 0,
      right: 160,
      bottom: 100,
      left: 0,
    }));
  });

  afterEach(() => {
    minimap.remove();
    state.minimapSvg = null;
  });

  test("hidden when diagram fits viewport (scale 1, no browser zoom)", () => {
    // SVG fills viewport at scale 1: both rects are equal
    const clone = mockElement({ width: 1200, height: 700 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 1200, height: 700 });

    updateMinimap(clone, viewport, mockPanzoom(1));

    expect(minimap.classList.contains("show")).toBe(false);
  });

  test("visible when diagram is zoomed past viewport (scale 2)", () => {
    // SVG at scale 2: GBCR returns 2x viewport dimensions (includes CSS transform)
    const clone = mockElement({ width: 2400, height: 1400 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 1200, height: 700 });

    updateMinimap(clone, viewport, mockPanzoom(2));

    expect(minimap.classList.contains("show")).toBe(true);
  });

  test("BUG FIX: hidden at 200% browser zoom with scale 1", () => {
    // At 200% browser zoom, getBoundingClientRect returns halved CSS pixels
    // for BOTH SVG and viewport. They still match because both are in the
    // same coordinate space.
    //
    // OLD BUG: used baseVal (800) vs GBCR (600) → 800*1 > 600*1.1 → true (WRONG)
    // FIX:     uses GBCR for both → 600 > 600*1.05 = 630 → false (CORRECT)
    const clone = mockElement({ width: 600, height: 350 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 600, height: 350 });

    updateMinimap(clone, viewport, mockPanzoom(1));

    expect(minimap.classList.contains("show")).toBe(false);
  });

  test("handles null arguments without throwing", () => {
    expect(() => updateMinimap(null, null, null)).not.toThrow();
    expect(() => updateMinimap(undefined, undefined, undefined)).not.toThrow();
  });

  test("handles missing minimap DOM element gracefully", () => {
    minimap.remove(); // minimap no longer in DOM
    const clone = mockElement({ width: 2400, height: 1400 });
    const viewport = mockElement({ width: 1200, height: 700 });

    expect(() => updateMinimap(clone, viewport, mockPanzoom(2))).not.toThrow();
  });
});
