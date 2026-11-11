/**
 * canvasGrid: the dot grid behind the fullscreen diagram
 */

import { jest } from "@jest/globals";
import "jest-canvas-mock";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { syncCanvasGrid, updateCanvasGrid } from "../src/ui/canvas-grid.js";
import { exportDiagram } from "../src/features/export.js";

describe("canvasGrid", () => {
  let viewport, clone, pan, scale;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = `
      <div class="diagram" id="src"><svg viewBox="0 0 100 50"><rect width="100" height="50"/></svg></div>
      <div id="diagview-modal-viewport" class="diagview-modal-viewport">
        <div id="diagview-rotator"><svg viewBox="0 0 100 50"><rect width="100" height="50"/></svg></div>
      </div>`;
    viewport = document.getElementById("diagview-modal-viewport");
    clone = viewport.querySelector("svg");
    pan = { x: 0, y: 0 };
    scale = 1;
    state.activePanzoom = { getScale: () => scale, getPan: () => ({ ...pan }) };
  });

  afterEach(() => {
    state.activePanzoom = null;
  });

  // jsdom drops a calc() in background-position, so record what the grid
  // writes there
  let position;
  beforeEach(() => {
    position = "";
    Object.defineProperty(viewport.style, "backgroundPosition", {
      configurable: true,
      get: () => position,
      set: (value) => {
        position = value;
      },
    });
  });

  const grid = () => ({ size: viewport.style.backgroundSize, position });

  test("is off by default and leaves the viewport alone", () => {
    expect(state.config.canvasGrid).toBe("none");
    syncCanvasGrid();
    expect(viewport.classList.contains("dv-grid-dots")).toBe(false);
    expect(viewport.getAttribute("style")).toBeNull();
    updateCanvasGrid(viewport, { x: 5, y: 5, scale: 2 });
    expect(viewport.getAttribute("style")).toBeNull();
  });

  test("dots turn on and off with the config", () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    expect(viewport.classList.contains("dv-grid-dots")).toBe(true);
    expect(grid()).toEqual({ size: "24px 24px", position: "calc(50% + 0px) calc(50% + 0px)" });

    updateConfig({ canvasGrid: "none" });
    syncCanvasGrid();
    expect(viewport.classList.contains("dv-grid-dots")).toBe(false);
    expect(grid()).toEqual({ size: "", position: "" });
  });

  test("the grid moves with the pan and scales with the zoom", () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    updateCanvasGrid(viewport, { x: 10, y: -4, scale: 1.25 });
    expect(grid()).toEqual({
      size: "30px 30px",
      position: "calc(50% + 12.5px) calc(50% + -5px)",
    });
  });

  test.each([
    [0.05, 19.2],
    [0.5, 24],
    [0.6, 28.8],
    [1, 24],
    [4, 24],
    [25, 18.75],
  ])("spacing at %sx stays between 16 and 32 pixels (%s)", (s, expected) => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    updateCanvasGrid(viewport, { x: 0, y: 0, scale: s });
    expect(parseFloat(grid().size)).toBeCloseTo(expected, 5);
  });

  test("follows an animated zoom and stays instant otherwise", () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    clone.style.transition = "transform 200ms ease-in-out";
    updateCanvasGrid(viewport, { x: 0, y: 0, scale: 2 });
    expect(viewport.style.transition).toBe(
      "background-size 200ms ease-in-out, background-position 200ms ease-in-out",
    );
    clone.style.transition = "none";
    updateCanvasGrid(viewport, { x: 0, y: 0, scale: 2 });
    expect(viewport.style.transition).toBe("");
  });

  test("reads the transition from the diagram it is given", () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    const query = jest.spyOn(viewport, "querySelector");
    clone.style.transition = "transform 300ms linear";
    updateCanvasGrid(viewport, { x: 0, y: 0, scale: 2 }, clone);
    expect(query).not.toHaveBeenCalled();
    expect(viewport.style.transition).toBe(
      "background-size 300ms linear, background-position 300ms linear",
    );
    query.mockRestore();
  });

  test("falls back to the pan from Panzoom when the event has none", () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    pan = { x: 8, y: 2 };
    updateCanvasGrid(viewport, { scale: 2 });
    expect(grid()).toEqual({ size: "24px 24px", position: "calc(50% + 16px) calc(50% + 4px)" });
  });

  test("a pan writes no custom property the diagram would inherit", () => {
    // A change to an inherited property restyles every element of the
    // diagram, on each pan frame
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    updateCanvasGrid(viewport, { x: 10, y: -4, scale: 1.25 });
    expect(viewport.getAttribute("style")).not.toMatch(/--/);
  });

  test("an unknown value keeps the previous setting", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ canvasGrid: "dots" });
    updateConfig({ canvasGrid: "lines" });
    expect(state.config.canvasGrid).toBe("dots");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("canvasGrid"));
    warn.mockRestore();
  });

  test("an SVG export from the viewer carries no grid", async () => {
    updateConfig({ canvasGrid: "dots" });
    syncCanvasGrid();
    let downloaded = "";
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      downloaded = this.href;
    });
    await exportDiagram(document.getElementById("src"), "svg", { modalClone: clone });
    click.mockRestore();
    const markup = decodeURIComponent(
      downloaded.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""),
    );
    expect(markup).toContain("<rect");
    expect(markup).not.toMatch(/radial-gradient|dv-grid/);
  });
});
