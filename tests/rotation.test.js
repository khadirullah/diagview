/**
 * Rotation Feature Tests
 * Tests for rotation state, persistence, and Panzoom integration logic.
 */

import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { rotateDiagram, resetRotation } from "../src/features/lazy/rotate.js";
import { saveZoomState, restoreZoomState } from "../src/features/panzoom-integration.js";

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
    sessionStorage.clear();
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

  test("saveZoomState includes rotation in sessionStorage", () => {
    updateConfig({ rememberZoom: true });
    state.rotationAngle = 270;
    saveZoomState("diag1", mockPanzoom);

    const stored = JSON.parse(sessionStorage.getItem("diagview-zoom-states:diag1"));
    expect(stored.rotation).toBe(270);
  });

  test("restoreZoomState restores rotation from sessionStorage", async () => {
    updateConfig({ rememberZoom: true });
    state.isModalOpen = true;
    state.activePanzoom = mockPanzoom;
    const zoomState = {
      scale: 1.5,
      pan: { x: 10, y: 20 },
      rotation: 180,
      timestamp: Date.now(),
    };
    sessionStorage.setItem("diagview-zoom-states:diag1", JSON.stringify(zoomState));

    restoreZoomState("diag1", mockPanzoom);

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
