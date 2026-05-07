import { jest } from "@jest/globals";
import "jest-canvas-mock";
import { exportDiagram, renderToCanvas } from "../src/features/export.js";
import { state, updateConfig } from "../src/core/config.js";

describe("Export Functionality", () => {
  let container, svg;

  beforeEach(() => {
    // Setup DOM
    container = document.createElement("div");
    container.className = "diagview-wrapper";

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);

    // Update config via official API
    updateConfig({
      highResScale: 2,
      mobileScale: 1,
      maxPixels: 16000000,
      security: { mode: "strict" },
    });

    // Mock URL methods
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();

    // Mock Image load - using real element for JSDOM compatibility
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set(val) {
          this._src = val;
          // Simulate async load
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 10);
        },
        get() {
          return this._src;
        },
      });
      return img;
    });
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
    jest.clearAllMocks();
  });

  test("renderToCanvas generates a high-res canvas by default", async () => {
    const { canvas, scale } = await renderToCanvas(container);

    expect(scale).toBe(2);
    // 100 width + 40 padding = 140. 140 * 2 scale = 280
    expect(canvas.width).toBe(280);
    expect(canvas.height).toBe(280);
  });

  test("maxPixels safety limit downscales massive diagrams", async () => {
    // Mock a huge diagram via viewBox (which getRobustDimensions reads)
    svg.setAttribute("viewBox", "0 0 10000 10000");
    updateConfig({ maxPixels: 1000000 }); // 1MP limit

    const { scale } = await renderToCanvas(container);

    // 10000 * 10000 becomes 11000 * 11000 after padding (5% each side)
    // To fit 1,000,000 pixels, scale should be sqrt(1M / 121M) = 1/11 ≈ 0.0909
    expect(scale).toBeCloseTo(0.0909);
  });

  test("exportDiagram triggers download with correct format", async () => {
    // Clear previous calls
    global.URL.createObjectURL.mockClear();

    await exportDiagram(container, "png", { filename: "test-export" });

    // verify success via URL.createObjectURL being called
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  test("visibility guard warns when exporting hidden elements", async () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    svg.style.display = "none";

    await renderToCanvas(container);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Exporting a hidden element"));
    consoleSpy.mockRestore();
  });
});
