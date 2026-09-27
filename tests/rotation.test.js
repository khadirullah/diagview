/**
 * Rotation Feature Tests
 * Tests for rotation state, persistence, and Panzoom integration logic.
 */

import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { rotateDiagram, resetRotation } from "../src/features/lazy/rotate.js";
import {
  saveZoomState,
  restoreZoomState,
  clearAllZoomStates,
  initializePanzoom,
} from "../src/features/panzoom-integration.js";

// Mock DOM
document.body.innerHTML = `
  <div id="diagview-modal-viewport">
    <div id="diagview-rotator">
      <svg id="test-svg"></svg>
    </div>
  </div>
  <div class="diagview-wrapper">
    <svg class="diagram" id="diag1"></svg>
  </div>
`;

// Mock Panzoom
const mockPanzoom = {
  getScale: () => 1,
  getPan: () => ({ x: 0, y: 0 }),
  zoom: jest.fn(),
  pan: jest.fn(),
  reset: jest.fn(),
  getElement: () => document.getElementById("test-svg"),
};

describe("Rotation Logic", () => {
  beforeEach(() => {
    resetConfig();
    state.rotationAngle = 0;
    state.activePanzoom = mockPanzoom;
    jest.clearAllMocks();
    clearAllZoomStates();
  });

  test("rotateDiagram increments angle by 90 and triggers Panzoom update", () => {
    rotateDiagram();
    expect(state.rotationAngle).toBe(90);
    expect(state.rotationAngle).toBe(90);
    const rotGroup = document.querySelector(".dv-rot-g");
    expect(rotGroup.getAttribute("transform")).toContain("rotate(90");
  });

  test("resetRotation resets angle to 0", () => {
    state.rotationAngle = 180;
    resetRotation();
    expect(state.rotationAngle).toBe(0);
    expect(mockPanzoom.reset).toHaveBeenCalled();
  });

  test("restoreZoomState restores the rotation saveZoomState remembered", async () => {
    updateConfig({ rememberZoom: true });
    state.isModalOpen = true;
    state.activePanzoom = mockPanzoom;
    state.rotationAngle = 180;
    saveZoomState("diag1", { ...mockPanzoom, getScale: () => 1.5 });
    state.rotationAngle = 0;

    expect(restoreZoomState("diag1", mockPanzoom)).toBe(true);

    // Rotation is now APPLIED via a dynamic import of rotate.js before
    // zoom/pan run — flush the async chain.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(state.rotationAngle).toBe(180);
    expect(mockPanzoom.zoom).toHaveBeenCalledWith(1.5, { animate: false });
  });
});

describe("Rotation viewBox", () => {
  let svg;
  beforeEach(() => {
    resetConfig();
    state.rotationAngle = 0;
    state.activePanzoom = mockPanzoom;
    const rotator = document.getElementById("diagview-rotator");
    rotator.innerHTML = `<svg viewBox="-20 10 400 200"><rect width="100%" height="100%"/></svg>`;
    svg = rotator.querySelector("svg");
  });

  const viewBox = () => svg.getAttribute("viewBox").split(" ").map(Number);

  test("turns about the unrotated centre and swaps the sides", () => {
    rotateDiagram();
    expect(viewBox()).toEqual([80, -90, 200, 400]);
    expect(svg.querySelector(".dv-rot-g").getAttribute("transform")).toBe("rotate(90, 180, 110)");
  });

  test("four turns return to the starting viewBox and eight do not grow it", () => {
    for (let i = 0; i < 4; i++) rotateDiagram();
    expect(viewBox()).toEqual([-20, 10, 400, 200]);
    for (let i = 0; i < 4; i++) rotateDiagram();
    expect(viewBox()).toEqual([-20, 10, 400, 200]);
    expect(svg.querySelector(".dv-rot-g").getAttribute("transform")).toBe("rotate(0, 180, 110)");
  });

  test("resetRotation restores the unrotated viewBox", () => {
    rotateDiagram();
    rotateDiagram();
    rotateDiagram();
    resetRotation();
    expect(viewBox()).toEqual([-20, 10, 400, 200]);
    expect(svg.querySelector(".dv-rot-g")).toBeNull();
  });
});

describe("rotateKeepsView", () => {
  // Screen = viewport centre + scale * (fit * rotate(angle) * (p - diagram centre) + pan).
  // fit is the viewBox refit: the 400x200 viewBox fits a 1000x800 box at 2.5
  // pixels per unit, and turned sideways at 2.
  const view = { cx: 500, cy: 400 };
  const centre = { x: 180, y: 110 };
  const fit = (angle) => (angle % 180 ? 2 : 2.5);
  let pz;
  let setTransform;
  let limits;

  const ctmFor = (angle) => {
    const rad = (angle * Math.PI) / 180;
    const [cos, sin] = [Math.round(Math.cos(rad)), Math.round(Math.sin(rad))];
    const s = pz.getScale();
    const k = s * fit(angle);
    const { x, y } = pz.getPan();
    const [a, b, c, d] = [k * cos, k * sin, -k * sin, k * cos];
    return {
      a,
      b,
      c,
      d,
      e: view.cx + s * x - (a * centre.x + c * centre.y),
      f: view.cy + s * y - (b * centre.x + d * centre.y),
    };
  };

  // Diagram point under the viewport centre, and screen pixels per unit
  const current = () => {
    const m = ctmFor(state.rotationAngle);
    const det = m.a * m.d - m.b * m.c;
    const [dx, dy] = [view.cx - m.e, view.cy - m.f];
    const round = (n) => Math.round(n * 1e6) / 1e6;
    return {
      point: [round((m.d * dx - m.c * dy) / det), round((m.a * dy - m.b * dx) / det)],
      unit: round(Math.hypot(m.a, m.b)),
    };
  };

  beforeEach(() => {
    resetConfig();
    state.rotationAngle = 0;
    const pan = { x: 20, y: -10 };
    let scale = 2;
    limits = [0.1, 10];
    setTransform = jest.fn();
    pz = {
      getScale: () => scale,
      getPan: () => ({ ...pan }),
      getOptions: () => ({ setTransform }),
      pan: jest.fn((x, y, opts) => {
        pan.x = (opts?.relative ? pan.x : 0) + x;
        pan.y = (opts?.relative ? pan.y : 0) + y;
      }),
      // Panzoom keeps the zoom inside minScale and maxScale
      zoom: jest.fn((s) => {
        scale = Math.min(limits[1], Math.max(limits[0], s));
      }),
      reset: jest.fn(),
    };
    state.activePanzoom = pz;
    const rotator = document.getElementById("diagview-rotator");
    rotator.innerHTML = `<svg viewBox="-20 10 400 200"><rect width="100%" height="100%"/></svg>`;
    const svg = rotator.querySelector("svg");
    // The SVG itself is unrotated; the rotation group reports the live angle
    svg.getScreenCTM = () => ctmFor(0);
    const origCreate = document.createElementNS.bind(document);
    jest.spyOn(document, "createElementNS").mockImplementation((ns, name) => {
      const el = origCreate(ns, name);
      el.getScreenCTM = () => ctmFor(state.rotationAngle);
      return el;
    });
    document.getElementById("diagview-modal-viewport").getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test("off by default: rotating resets the view", () => {
    rotateDiagram();
    expect(pz.reset).toHaveBeenCalled();
    expect(pz.pan).not.toHaveBeenCalled();
    expect(pz.zoom).not.toHaveBeenCalled();
  });

  test("keeps the size on screen and the point under the viewport centre", () => {
    updateConfig({ rotateKeepsView: true });
    const before = current();
    rotateDiagram();
    expect(pz.reset).not.toHaveBeenCalled();
    // 2 * 2.5 / 2: the zoom % changes so the diagram keeps its size
    expect(pz.getScale()).toBe(2.5);
    expect(current()).toEqual(before);
    // The new view reaches the DOM at once, not a frame after the new viewBox
    expect(setTransform).toHaveBeenLastCalledWith(
      expect.any(Element),
      { ...pz.getPan(), scale: 2.5 },
      expect.anything(),
    );

    // Four turns bring the zoom and pan back to where they started
    rotateDiagram();
    rotateDiagram();
    rotateDiagram();
    expect(state.rotationAngle).toBe(0);
    expect(pz.getScale()).toBe(2);
    expect(pz.getPan().x).toBeCloseTo(20, 9);
    expect(pz.getPan().y).toBeCloseTo(-10, 9);
    expect(current()).toEqual(before);
  });

  test("at a zoom limit the size gives way but the centre point stays", () => {
    updateConfig({ rotateKeepsView: true });
    limits = [0.1, 2.2];
    const before = current();
    rotateDiagram();
    expect(pz.getScale()).toBe(2.2);
    expect(current().point).toEqual(before.point);
    expect(current().unit).toBeCloseTo(4.4, 9);
  });

  test("tells the minimap and zoom display about the turn in both modes", () => {
    const svg = document.querySelector("#diagview-rotator svg");
    const seen = [];
    svg.addEventListener("panzoomchange", (e) => seen.push(e.detail));
    rotateDiagram();
    updateConfig({ rotateKeepsView: true });
    rotateDiagram();
    // The kept view turns sideways to upright, so its zoom % drops to 1.6
    expect(seen).toEqual([
      { scale: 2, isRotation: true },
      { scale: 1.6, isRotation: true },
    ]);
  });

  test("onZoomChange skips the turn event, which changes no zoom", () => {
    const onZoomChange = jest.fn();
    updateConfig({ onZoomChange });
    window.Panzoom = jest.fn(() => pz);
    const svg = document.querySelector("#diagview-rotator svg");
    initializePanzoom(svg);
    rotateDiagram();
    expect(onZoomChange).not.toHaveBeenCalled();
    svg.dispatchEvent(new CustomEvent("panzoomchange", { detail: { scale: 3 } }));
    expect(onZoomChange).toHaveBeenCalledWith(3);
    for (const fn of Array.from(state.modalCleanupFunctions)) fn();
    state.modalCleanupFunctions.clear();
    delete window.Panzoom;
  });

  test("falls back to a reset when the view cannot be measured", () => {
    updateConfig({ rotateKeepsView: true });
    document.querySelector("#diagview-rotator svg").getScreenCTM = () => null;
    rotateDiagram();
    expect(pz.reset).toHaveBeenCalled();
    expect(state.rotationAngle).toBe(90);
  });
});
