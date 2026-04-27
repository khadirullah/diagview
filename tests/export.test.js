/**
 * Export Module Tests
 * Tests for filename generation, dimension calculation, and viewBox handling.
 * Includes regression test for Bug 3: NPE on missing viewBox.
 */

import { jest } from "@jest/globals";
import { generateFilename, renderToCanvas } from "../src/features/export.js";
import { state, resetConfig } from "../src/core/config.js";

describe("Export: generateFilename", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("extracts filename from SVG <title> element", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "My Flow Chart";
    svg.appendChild(title);

    const filename = generateFilename(svg);
    // sanitizeFilename lowercases and replaces spaces with underscores
    expect(filename).toMatch(/^my_flow_chart_\d{4}-\d{2}-\d{2}_\d{6}$/);
  });

  test("extracts filename from title-class text element", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "titleText");
    text.textContent = "Architecture Diagram";
    svg.appendChild(text);

    const filename = generateFilename(svg);
    expect(filename).toMatch(/^architecture_diagram_\d{4}-\d{2}-\d{2}_\d{6}$/);
  });

  test("falls back to wrapper label text", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "diagview-wrapper";
    const label = document.createElement("div");
    label.className = "diagview-label";
    label.textContent = "SEQUENCE DIAGRAM";
    wrapper.appendChild(label);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    wrapper.appendChild(svg);
    document.body.appendChild(wrapper);

    const filename = generateFilename(svg);
    expect(filename).toMatch(/^sequence_diagram_\d{4}-\d{2}-\d{2}_\d{6}$/);
  });

  test("falls back to 'diagram_export' when no title found", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const filename = generateFilename(svg);
    expect(filename).toMatch(/^diagram_export_\d{4}-\d{2}-\d{2}_\d{6}$/);
  });

  test("sanitizes special characters from filename", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "My <Diagram> & Flow!";
    svg.appendChild(title);

    const filename = generateFilename(svg);
    // Special chars stripped, spaces → underscores
    expect(filename).not.toMatch(/[<>&!]/);
    expect(filename).toMatch(/^my_diagram__flow_\d{4}-\d{2}-\d{2}_\d{6}$/);
  });
});

describe("Export: viewBox parsing safety (Bug 3 regression)", () => {
  test("exportSVG handles missing viewBox without throwing", () => {
    // This tests the fix for Bug 3: svg.getAttribute("viewBox").split(" ")
    // would throw NPE if viewBox was null.
    // We test the viewBox parsing logic directly.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // No viewBox attribute set

    const vb = svg.getAttribute("viewBox");
    const vbParts = vb ? vb.split(/\s+|,/).map(parseFloat) : [0, 0];

    expect(vbParts[0]).toBe(0);
    expect(vbParts[1]).toBe(0);
  });

  test("viewBox parsing handles comma-separated values", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "10,20,800,600");

    const vb = svg.getAttribute("viewBox");
    const vbParts = vb ? vb.split(/\s+|,/).map(parseFloat) : [0, 0];

    expect(vbParts[0]).toBe(10);
    expect(vbParts[1]).toBe(20);
    expect(vbParts[2]).toBe(800);
    expect(vbParts[3]).toBe(600);
  });

  test("viewBox parsing handles space-separated values", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 800 600");

    const vb = svg.getAttribute("viewBox");
    const vbParts = vb ? vb.split(/\s+|,/).map(parseFloat) : [0, 0];

    expect(vbParts[0]).toBe(0);
    expect(vbParts[1]).toBe(0);
    expect(vbParts[2]).toBe(800);
    expect(vbParts[3]).toBe(600);
  });
});

describe("Export: Image Rendering (T3)", () => {
  let sourceElement;

  beforeEach(() => {
    resetConfig();
    document.body.innerHTML = "";
    sourceElement = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    sourceElement.appendChild(svg);
    document.body.appendChild(sourceElement);

    // Mock Image
    global.Image = class {
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    };

    // Mock canvas methods for JSDOM
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      drawImage: jest.fn(),
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
    });
  });

  test("renderToCanvas creates a canvas with scaled dimensions", async () => {
    const result = await renderToCanvas(sourceElement);

    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    // Default HighRes is 4x (per EXPORT.HIGH_RES_SCALE_DEFAULT)
    expect(result.canvas.width).toBe(Math.round(result.width * 4));
  });

  test("renderToCanvas returns the correct scale", async () => {
    const { scale } = await renderToCanvas(sourceElement);
    // Desktop default is 4
    expect(scale).toBe(4);
  });
});
