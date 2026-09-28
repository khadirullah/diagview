import { jest } from "@jest/globals";
import "jest-canvas-mock";
import {
  exportDiagram,
  renderToCanvas,
  copySVGCode,
  exportToSVG,
  exportToPNG,
  exportToJPEG,
  exportToWebP,
  exportToPDF,
  copyToClipboard,
  generateFilename,
} from "../src/features/export.js";
import { hideToast } from "../src/ui/toast.js";
import { state, updateConfig } from "../src/core/config.js";

// A new notice replaces the last one, so keep every notice that was shown
const recordToasts = () => {
  const seen = [];
  const note = (records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.classList?.contains("diagview-toast")) seen.push(n.textContent);
        n.querySelectorAll?.(".diagview-toast").forEach((t) => seen.push(t.textContent));
      }
    }
  };
  const mo = new MutationObserver(note);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    note(mo.takeRecords());
    mo.disconnect();
    return seen;
  };
};

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

  test("renderToCanvas loads an SVG over 1 MB through a data: URL, not a blob: URL", async () => {
    // Chrome taints the canvas for a blob: SVG with <foreignObject>
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "x".repeat(1100000);
    svg.appendChild(text);

    await renderToCanvas(container);

    const img = global.Image.mock.results[0].value;
    expect(img.src.startsWith("data:image/svg+xml")).toBe(true);
    expect(img.src.length).toBeGreaterThan(1100000);
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  describe("when the browser refuses the data: URL", () => {
    const imageFailing = (failBlob) =>
      jest.fn(() => {
        const img = document.createElement("img");
        img.tried = [];
        Object.defineProperty(img, "src", {
          set(val) {
            this._src = val;
            this.tried.push(val.slice(0, 5));
            const fails = val.startsWith("data:") || failBlob;
            setTimeout(() => (fails ? this.onerror?.() : this.onload?.()), 10);
          },
          get() {
            return this._src;
          },
        });
        return img;
      });

    test("retries through a blob: URL and frees it after drawing", async () => {
      global.Image = imageFailing(false);

      const { canvas } = await renderToCanvas(container);

      const img = global.Image.mock.results[0].value;
      expect(img.tried).toEqual(["data:", "blob:"]);
      expect(canvas.width).toBe(280);
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    test("rejects with the size message when the blob: URL fails too", async () => {
      global.Image = imageFailing(true);

      await expect(renderToCanvas(container)).rejects.toThrow("SVG may be too large");
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  test("visibility guard warns when exporting hidden elements", async () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    svg.style.display = "none";

    await renderToCanvas(container);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Exporting a hidden element"));
    consoleSpy.mockRestore();
  });

  test("copySVGCode serializes SVG markup to clipboard", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockImplementation((text) => {
          copiedText = text;
          return Promise.resolve();
        }),
      },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    await exportDiagram(container, "copy-svg");

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(copiedText).toContain("<svg");
  });

  test("renderToCanvas honours data-diagview-scale on the exported element", async () => {
    container.dataset.diagviewScale = "3";

    const { canvas, scale } = await renderToCanvas(container);

    expect(scale).toBe(3);
    expect(canvas.width).toBe(420); // (100 + 40 padding) * 3
  });

  test("exportToSVG(el) applies the element's data-diagview-watermark-* overrides", async () => {
    updateConfig({ watermark: { enabled: false, text: "GLOBALMARK" } });
    state.activeSourceElement = null; // no modal open: inline toolbar / public API path
    container.dataset.diagviewWatermark = "true";
    container.dataset.diagviewWatermarkText = "LOCALMARK";

    let downloaded = "";
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      downloaded = this.href;
    });

    await exportToSVG(container, { filename: "wm" });

    click.mockRestore();
    delete container.dataset.diagviewWatermark;
    delete container.dataset.diagviewWatermarkText;

    const markup = decodeURIComponent(
      downloaded.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""),
    );
    expect(markup).toContain("LOCALMARK");
    expect(markup).not.toContain("GLOBALMARK");
  });

  describe("watermark values DiagView does not know", () => {
    let warn, click, downloaded;
    beforeEach(() => {
      state.activeSourceElement = null;
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      downloaded = "";
      click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
        downloaded = this.href;
      });
    });
    afterEach(() => {
      warn.mockRestore();
      click.mockRestore();
      for (const key of Object.keys(container.dataset)) delete container.dataset[key];
      updateConfig({
        watermark: {
          enabled: false,
          text: "",
          style: "corner",
          position: "bottom-right",
          opacity: 0.2,
        },
      });
    });
    const markup = () =>
      decodeURIComponent(downloaded.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
    const warnings = () =>
      warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("atermark"));

    test("an unknown position or opacity warns and uses the default or nearest value", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK" } });
      container.dataset.diagviewWatermarkStyle = "corner";
      container.dataset.diagviewWatermarkPos = "middle";
      container.dataset.diagviewWatermarkOpacity = "5";

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([
        expect.stringContaining('position "middle"'),
        expect.stringContaining('opacity "5"'),
      ]);
      expect(warnings()[0]).toContain("Using bottom-right.");
      expect(warnings()[1]).toContain("Using 1.");
      expect(markup()).toContain("MARK");
      expect(markup()).toContain('fill-opacity="1"');
      expect(markup()).toContain('text-anchor="end"'); // bottom-right
    });

    test('"both" writes its scaled opacities rounded to three decimals', async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK", style: "both", opacity: 0.2 } });

      await exportToSVG(container, { filename: "wm" });

      const opacities = [...markup().matchAll(/(?:fill|stroke)-opacity="([^"]*)"/g)].map(
        (m) => m[1],
      );
      // 0.2 * 0.8 for the corner mark, 0.2 * 0.6 for the centre one, halved for the outline
      expect(opacities).toEqual(expect.arrayContaining(["0.16", "0.08", "0.12", "0.06"]));
      expect(opacities.every((o) => o.length <= 5)).toBe(true);
    });

    test("an unknown style warns and draws the corner watermark", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK", style: "fancy" } });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining('style "fancy"')]);
      expect(warnings()[0]).toContain("Using corner.");
      expect(markup()).toContain("MARK");
      expect(markup()).toContain('text-anchor="end"');
      expect(markup()).not.toContain("rotate(-30");
    });

    test("a negative opacity is raised to 0", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK", opacity: -1 } });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining("Using 0.")]);
      expect(markup()).toContain('fill-opacity="0"');
    });

    test("an opacity that is not a number warns and uses the default", async () => {
      for (const opacity of [true, "abc", NaN]) {
        warn.mockClear();
        updateConfig({ watermark: { enabled: true, text: "MARK", opacity } });
        await exportToSVG(container, { filename: "wm" });
        expect(warnings()).toEqual([expect.stringContaining("should be a number from 0 to 1")]);
        expect(warnings()[0]).toContain("Using 0.2.");
        expect(markup()).toContain('fill-opacity="0.2"');
      }
    });

    test("an unknown style from an attribute uses corner", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK" } });
      container.dataset.diagviewWatermarkStyle = "fancy";

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining("Using corner.")]);
      expect(markup()).toContain('text-anchor="end"');
    });

    test("an unknown position with the background style still draws the centred mark", async () => {
      updateConfig({
        watermark: { enabled: true, text: "MARK", style: "background", position: "middle" },
      });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining("Using bottom-right.")]);
      expect(markup()).toContain("rotate(-30");
      expect(markup()).not.toContain('text-anchor="end"');
    });

    test("a background watermark with a bad opacity uses 0.2", async () => {
      updateConfig({
        watermark: { enabled: true, text: "MARK", style: "background", opacity: "abc" },
      });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining("Using 0.2.")]);
      expect(markup()).toContain('fill-opacity="0.2"');
    });

    test("an infinite opacity is clamped to 1", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK", opacity: Infinity } });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([expect.stringContaining("Using 1.")]);
      expect(markup()).toContain('fill-opacity="1"');
    });

    test("valid values with spaces around them or a numeric string opacity do not warn", async () => {
      updateConfig({
        watermark: {
          enabled: true,
          text: "MARK",
          style: " corner ",
          position: " top-left",
          opacity: "0.5",
        },
      });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([]);
      expect(markup()).toContain('text-anchor="start"');
      expect(markup()).toContain('fill-opacity="0.5"');
    });

    test("an empty opacity uses 0.2 without a warning", async () => {
      for (const opacity of ["", "  ", null]) {
        warn.mockClear();
        updateConfig({ watermark: { enabled: true, text: "MARK", opacity } });
        await exportToSVG(container, { filename: "wm" });
        expect(warnings()).toEqual([]);
        expect(markup()).toContain('fill-opacity="0.2"');
      }
    });

    test("an opacity attribute that is not a number warns and keeps the config opacity", async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK", opacity: 0.4 } });
      container.dataset.diagviewWatermarkOpacity = "0.5abc";

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([
        expect.stringContaining('data-diagview-watermark-opacity "0.5abc"'),
      ]);
      expect(markup()).toContain('fill-opacity="0.4"');
    });

    test('data-diagview-watermark="false" turns off a watermark enabled in the config', async () => {
      updateConfig({ watermark: { enabled: true, text: "MARK" } });
      container.dataset.diagviewWatermark = "false";

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([]);
      expect(markup()).not.toContain("MARK");
    });

    test("known values in any case do not warn", async () => {
      updateConfig({
        watermark: {
          enabled: true,
          text: "MARK",
          style: "Both",
          position: "FOUR-SIDES",
          opacity: 0,
        },
      });

      await exportToSVG(container, { filename: "wm" });

      expect(warnings()).toEqual([]);
      expect(markup()).toContain("rotate(-30"); // the "both" centre mark
      expect(markup().match(/rotate\(-?90/g)).toHaveLength(2); // left and right edges
      expect(markup()).toContain('fill-opacity="0"');
    });
  });

  // The test diagram is 100 by 100 at the origin, and the export adds a
  // 20 unit margin around it
  describe("watermark.placement", () => {
    let warn, click, downloaded;
    beforeEach(() => {
      state.activeSourceElement = null;
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      downloaded = "";
      click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
        downloaded = this.href;
      });
    });
    afterEach(() => {
      warn.mockRestore();
      click.mockRestore();
      for (const key of Object.keys(container.dataset)) delete container.dataset[key];
      updateConfig({
        watermark: {
          enabled: false,
          text: "",
          style: "corner",
          position: "bottom-right",
          placement: "diagram",
          opacity: 0.2,
        },
      });
    });
    const exportWith = async (watermark) => {
      updateConfig({
        watermark: {
          enabled: true,
          text: "MARK",
          style: "corner",
          position: "bottom-right",
          placement: "diagram",
          opacity: 0.2,
          ...watermark,
        },
      });
      await exportToSVG(container, { filename: "wm" });
      return decodeURIComponent(downloaded.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
    };
    const marks = (markup) =>
      [...new DOMParser().parseFromString(markup, "text/html").querySelectorAll("text")].map(
        (t) => ({
          x: Number(t.getAttribute("x")),
          y: Number(t.getAttribute("y")),
          anchor: t.getAttribute("text-anchor"),
          baseline: t.getAttribute("dominant-baseline"),
          transform: t.getAttribute("transform"),
        }),
      );
    const warnings = () =>
      warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("atermark"));
    const inDiagram = (m) => m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100;
    const inMargin = (m) =>
      m.x >= -20 &&
      m.x <= 120 &&
      m.y >= -20 &&
      m.y <= 120 &&
      !(m.x > 0 && m.x < 100 && m.y > 0 && m.y < 100);

    const styles = ["corner", "background", "both"];
    const positions = [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "center",
      "four-sides",
    ];

    test('"diagram" gives the same file as no placement at all', async () => {
      for (const style of styles) {
        for (const position of positions) {
          const unset = await exportWith({ style, position, placement: undefined });
          const diagram = await exportWith({ style, position, placement: "diagram" });
          expect(diagram).toBe(unset);
        }
      }
      expect(warnings()).toEqual([]);
    });

    test('"diagram" draws corner and side marks inside the diagram', async () => {
      for (const position of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
        "four-sides",
      ]) {
        const found = marks(await exportWith({ position }));
        expect(found.length).toBeGreaterThan(0);
        for (const m of found) {
          expect(inDiagram(m)).toBe(true);
          expect(m.baseline).toBeNull();
        }
      }
    });

    test('"margin" centres four-sides marks in the margin on each side', async () => {
      const found = marks(await exportWith({ position: "four-sides", placement: "margin" }));
      expect(found).toEqual([
        { x: 50, y: -10, anchor: "middle", baseline: "middle", transform: null },
        { x: 50, y: 110, anchor: "middle", baseline: "middle", transform: null },
        { x: -10, y: 50, anchor: "middle", baseline: "middle", transform: "rotate(-90, -10, 50)" },
        { x: 110, y: 50, anchor: "middle", baseline: "middle", transform: "rotate(90, 110, 50)" },
      ]);
    });

    test.each([
      ["top-left", 0, -10, "start"],
      ["top-right", 100, -10, "end"],
      ["bottom-left", 0, 110, "start"],
      ["bottom-right", 100, 110, "end"],
    ])(
      '"margin" puts %s text in the margin, lined up with the diagram edge',
      async (position, x, y, anchor) => {
        const found = marks(await exportWith({ position, placement: "margin" }));
        expect(found).toEqual([{ x, y, anchor, baseline: "middle", transform: null }]);
        expect(inMargin(found[0])).toBe(true);
      },
    );

    test('"margin" keeps the text size and fits it inside the margin', async () => {
      const fontSize = (markup) => parseFloat(markup.match(/font-size="([\d.]+)px"/)[1]);
      for (const width of [100, 600, 2000]) {
        svg.setAttribute("viewBox", `0 0 ${width} 100`);
        svg.setAttribute("width", String(width));
        const diagram = await exportWith({ position: "bottom-right" });
        const markup = await exportWith({ position: "bottom-right", placement: "margin" });
        const pad = -Number(markup.match(/viewBox="(-?[\d.]+)/)[1]);
        expect(fontSize(markup)).toBe(fontSize(diagram));
        expect(fontSize(markup)).toBeLessThanOrEqual(pad * 0.6);
        expect(marks(markup)[0]).toMatchObject({ x: width, y: 100 + pad / 2 });
      }
    });

    test('"center" and "background" stay on the diagram with "margin"', async () => {
      for (const [style, position] of [
        ["corner", "center"],
        ["background", "bottom-right"],
        ["background", "four-sides"],
      ]) {
        const diagram = await exportWith({ style, position });
        const margin = await exportWith({ style, position, placement: "margin" });
        expect(margin).toBe(diagram);
        expect(marks(margin)).toEqual([
          { x: 50, y: 50, anchor: "middle", baseline: "middle", transform: "rotate(-30, 50, 50)" },
        ]);
      }
    });

    test('"both" keeps the centre mark on the diagram and moves the small marks', async () => {
      const found = marks(
        await exportWith({ style: "both", position: "four-sides", placement: "margin" }),
      );
      expect(found).toHaveLength(5);
      expect(found[0].transform).toBe("rotate(-30, 50, 50)");
      for (const m of found.slice(1)) expect(inMargin(m)).toBe(true);
    });

    test("a wide name shrinks to its measured width, not the 0.6 estimate", async () => {
      // Bold "W" is about 0.9 of the font size wide, well over the 0.6 average
      const measure = jest
        .spyOn(CanvasRenderingContext2D.prototype, "measureText")
        .mockImplementation(function (text) {
          return { width: parseFloat(this.font.match(/(\d+)px/)[1]) * 0.9 * text.length };
        });
      const text = "W".repeat(30);
      const markup = await exportWith({ text, position: "bottom-right" });
      measure.mockRestore();

      const size = parseFloat(markup.match(/font-size="([\d.]+)px"/)[1]);
      // The corner mark gets 35% of the 100 px wide diagram
      expect(size * 0.9 * text.length).toBeCloseTo(35, 5);
    });

    test("data-diagview-watermark-placement overrides the config", async () => {
      container.dataset.diagviewWatermarkPlacement = "margin";
      expect(marks(await exportWith({ placement: "diagram" }))[0]).toMatchObject({
        x: 100,
        y: 110,
      });

      container.dataset.diagviewWatermarkPlacement = "diagram";
      expect(inDiagram(marks(await exportWith({ placement: "margin" }))[0])).toBe(true);
      expect(warnings()).toEqual([]);
    });

    test("placement matches without regard to case or spaces", async () => {
      const found = marks(await exportWith({ placement: " MARGIN " }));
      expect(found[0]).toMatchObject({ x: 100, y: 110 });
      expect(warnings()).toEqual([]);
    });

    test("an unknown placement warns once and uses diagram", async () => {
      const found = marks(await exportWith({ position: "four-sides", placement: "outside" }));
      expect(warnings()).toEqual([
        'DiagView: Unknown watermark placement "outside", expected diagram or margin. Using diagram.',
      ]);
      for (const m of found) expect(inDiagram(m)).toBe(true);
    });

    test("an unknown placement from an attribute warns and uses diagram", async () => {
      container.dataset.diagviewWatermarkPlacement = "edge";
      const found = marks(await exportWith({ placement: "margin" }));
      expect(warnings()).toEqual([expect.stringContaining('placement "edge"')]);
      expect(warnings()[0]).toContain("Using diagram.");
      expect(inDiagram(found[0])).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Export regressions (one describe per fix)
// ---------------------------------------------------------------------------
describe("Export keeps structural <g> transforms", () => {
  let container, svg;

  beforeEach(() => {
    container = document.createElement("div");
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("style", "transform: translate(40px, 0px)");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "10");
    rect.setAttribute("height", "10");
    g.appendChild(rect);
    svg.appendChild(g);
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ security: { mode: "strict" } });
  });

  afterEach(() => {
    container.remove();
    jest.clearAllMocks();
  });

  test("a <g style='transform: translate(...)'> survives into the exported SVG", async () => {
    let copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn((t) => ((copiedText = t), Promise.resolve())) },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    await copySVGCode(container);

    expect(copiedText).toContain("<svg");
    expect(copiedText).toMatch(/translate\(40px/);
  });
});

describe("Export keeps the author's text colours", () => {
  let container, modalClone, text;

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);

    // The modal clone with one label recoloured for the canvas
    modalClone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    modalClone.setAttribute("viewBox", "0 0 100 100");
    text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("fill", "#333333");
    text.textContent = "Label";
    text.setAttribute("data-dv-text-orig", "");
    text.setAttribute("data-dv-text-prio", "");
    text.style.setProperty("fill", "rgb(250, 250, 250)", "important");
    modalClone.appendChild(text);
    document.body.appendChild(modalClone);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn(() => Promise.resolve()) },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    updateConfig({ security: { mode: "strict" } });
  });

  afterEach(() => {
    container.remove();
    modalClone.remove();
    jest.clearAllMocks();
  });

  test("copied SVG markup has the original colours, the modal keeps the readable ones", async () => {
    await copySVGCode(container, { modalClone });

    const copied = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copied).toContain("Label");
    expect(copied).not.toContain("rgb(250, 250, 250)");
    expect(copied).not.toContain("data-dv-text");

    expect(text.style.getPropertyValue("fill")).toBe("rgb(250, 250, 250)");
    expect(text.style.getPropertyPriority("fill")).toBe("important");
    expect(text.getAttribute("data-dv-text-orig")).toBe("");
  });
});

describe("Exports follow the Readable text colours", () => {
  const NS = "http://www.w3.org/2000/svg";
  let container, label, downloads, clickSpy, imageSrcs;

  const place = (el, x, y, w, h) => {
    el.getBoundingClientRect = () => ({
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
    });
  };
  const svgMarkup = () =>
    decodeURIComponent(downloads[0].href.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
  const imageMarkup = () =>
    decodeURIComponent(imageSrcs[0].replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
  // The fill the exported label ends up with
  const labelFill = (markup) => markup.match(/<text[^>]*style="[^"]*fill: ([^;"]+)/)?.[1];

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    // Dark text straight on the canvas, like a sequence message
    label = document.createElementNS(NS, "text");
    label.setAttribute("style", "fill: #333333");
    label.textContent = "Label";
    place(label, 10, 10, 60, 12);
    svg.appendChild(label);
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "strict" } });

    downloads = [];
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      downloads.push({ name: this.download, href: this.href });
    });
    imageSrcs = [];
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set(val) {
          imageSrcs.push(val);
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };

    state.activeCanvasThemeMode = "dark";
    state.readableText = true;
    state.themeCache = null;
  });

  afterEach(() => {
    container.remove();
    clickSpy.mockRestore();
    state.activeCanvasThemeMode = "auto";
    state.readableText = false;
    state.themeCache = null;
    hideToast();
  });

  test("an SVG export on a dark canvas gets the light label, the page keeps its own", async () => {
    await exportToSVG(container, { filename: "d" });

    const fill = labelFill(svgMarkup());
    expect(fill).toMatch(/^rgb.*!important$/);
    // Light enough to read on the dark background
    expect(Math.min(...fill.match(/\d+/g).map(Number))).toBeGreaterThan(150);

    expect(label.getAttribute("style")).toBe("fill: #333333");
    expect(label.hasAttribute("data-dv-text-orig")).toBe(false);
  });

  test("a fullscreen export repaints from the author's colour and keeps the view as it is", async () => {
    // The modal clone, its label already recoloured for the viewer's canvas
    const modalClone = container.querySelector("svg").cloneNode(true);
    const shown = modalClone.querySelector("text");
    place(shown, 10, 10, 60, 12);
    shown.setAttribute("data-dv-text-orig", "#333333");
    shown.setAttribute("data-dv-text-prio", "");
    shown.style.setProperty("fill", "rgb(1, 2, 3)", "important");
    document.body.appendChild(modalClone);

    await exportToSVG(container, { filename: "d", modalClone });

    const markup = svgMarkup();
    expect(markup).not.toContain("data-dv-text");
    expect(markup).not.toContain("rgb(1, 2, 3)");
    expect(labelFill(markup)).toMatch(/^rgb.*!important$/);
    expect(shown.style.getPropertyValue("fill")).toBe("rgb(1, 2, 3)");
    modalClone.remove();
  });

  test("a PNG export draws the same light label", async () => {
    await exportDiagram(container, "png", { filename: "d" });

    expect(labelFill(imageMarkup())).toMatch(/^rgb.*!important$/);
  });

  test.each([
    ["transparent SVG", () => exportToSVG(container, { transparent: true })],
    ["png-transparent", () => exportDiagram(container, "png-transparent")],
  ])("a %s export keeps the author's colours", async (_name, run) => {
    await run();

    const markup = imageSrcs.length ? imageMarkup() : svgMarkup();
    expect(labelFill(markup)).toBe("#333333");
  });

  test("with Readable off the export keeps the author's colours", async () => {
    state.readableText = false;
    await exportToSVG(container, { filename: "d" });

    expect(labelFill(svgMarkup())).toBe("#333333");
  });
});

describe("Warning about labels that are hard to read in the file", () => {
  const NS = "http://www.w3.org/2000/svg";
  const WARNING = "some labels are hard to read on this background.";
  let container, svg, label, clickSpy;

  const place = (el, x, y, w, h) => {
    el.getBoundingClientRect = () => ({
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
    });
  };
  const warnings = async (run) => {
    const stop = recordToasts();
    await run();
    return stop().some((t) => t.includes(WARNING));
  };

  beforeEach(() => {
    container = document.createElement("div");
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    // Dark text straight on the canvas, like a sequence message
    label = document.createElementNS(NS, "text");
    label.setAttribute("style", "fill: #333333");
    label.textContent = "Label";
    place(label, 10, 10, 60, 12);
    svg.appendChild(label);
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "strict" } });

    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set() {
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };

    state.activeCanvasThemeMode = "dark";
    state.themeCache = null;
  });

  afterEach(() => {
    container.remove();
    clickSpy.mockRestore();
    state.activeCanvasThemeMode = "auto";
    state.readableText = false;
    state.themeCache = null;
    hideToast();
  });

  test("a PNG export on a dark canvas warns in one notice that also says it saved", async () => {
    const stop = recordToasts();
    await exportDiagram(container, "png");
    const seen = stop().filter((t) => !t.startsWith("Processing"));

    expect(seen).toEqual([
      "1.0x PNG saved, but some labels are hard to read on this background. Turn on Readable, or pick Light, and export again.",
    ]);
  });

  test.each([
    ["#6b7280", "#333333", "Turn on Readable, or pick Light, and export again."],
    ["#b3b3b3", "#999999", "Turn on Readable and export again."],
  ])(
    "a %s canvas warns too, and suggests Light only where it helps",
    async (canvas, fill, advice) => {
      state.activeCanvasThemeMode = "custom";
      state.customCanvasColor = canvas;
      label.setAttribute("style", `fill: ${fill}`);
      const stop = recordToasts();
      await exportToSVG(container);
      const seen = stop();
      state.customCanvasColor = null;

      expect(seen).toContain(
        `SVG saved, but some labels are hard to read on this background. ${advice}`,
      );
    },
  );

  test("warns once per viewer open, not on every export", async () => {
    const modalClone = svg.cloneNode(true);
    place(modalClone.querySelector("text"), 10, 10, 60, 12);
    document.body.appendChild(modalClone);

    expect(await warnings(() => exportDiagram(container, "svg", { modalClone }))).toBe(true);
    expect(await warnings(() => exportDiagram(container, "png", { modalClone }))).toBe(false);
    expect(await warnings(() => exportDiagram(container, "webp", { modalClone }))).toBe(false);

    // The next open has a new clone
    const nextOpen = svg.cloneNode(true);
    place(nextOpen.querySelector("text"), 10, 10, 60, 12);
    document.body.appendChild(nextOpen);
    expect(await warnings(() => exportDiagram(container, "png", { modalClone: nextOpen }))).toBe(
      true,
    );
    modalClone.remove();
    nextOpen.remove();
  });

  test.each([
    ["Readable is on", () => (state.readableText = true), () => exportToSVG(container)],
    ["the export is transparent", () => {}, () => exportDiagram(container, "png-transparent")],
    ["the export is silent", () => {}, () => exportDiagram(container, "svg", { silent: true })],
    ["a copy is silent", () => {}, () => exportDiagram(container, "copy", { silent: true })],
    ["copyToClipboard is silent", () => {}, () => copyToClipboard(container, { silent: true })],
    [
      "the canvas is light",
      () => (state.activeCanvasThemeMode = "light"),
      () => exportToSVG(container),
    ],
    [
      "the label sits in a light node",
      () => {
        const node = document.createElementNS(NS, "rect");
        node.setAttribute("style", "fill: #ececff");
        place(node, 0, 0, 100, 40);
        svg.insertBefore(node, label);
      },
      () => exportToSVG(container),
    ],
  ])("no warning when %s", async (_name, setup, run) => {
    setup();
    expect(await warnings(run)).toBe(false);
  });

  test.each([
    ["png", "1.0x PNG saved"],
    ["webp", "1.0x WebP saved"],
  ])("a %s that also leaves out linked images shows one notice", async (mode, saved) => {
    const image = document.createElementNS(NS, "image");
    image.setAttribute("href", "logo.png");
    svg.appendChild(image);
    const stop = recordToasts();
    await exportDiagram(container, mode);
    const seen = stop().filter((t) => !t.startsWith("Processing"));

    expect(seen).toEqual([
      `${saved}, but 1 linked image was left out and some labels are hard to read on this background. Turn on Readable, or pick Light, and export again.`,
    ]);
  });

  test("a copy without silent warns", async () => {
    const stop = recordToasts();
    await exportDiagram(container, "copy");
    const seen = stop().filter((t) => t.includes(WARNING));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(
      /^(Copied to clipboard|PNG downloaded \(Clipboard unavailable\)), but some/,
    );
  });

  test("a silent copy skips the Processing toast", async () => {
    const stop = recordToasts();
    await copyToClipboard(container, { silent: true });
    expect(stop().some((t) => /Processing/.test(t))).toBe(false);
  });
});

describe("exportSearchHighlight", () => {
  let container, modalClone, match, other, css;

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);

    // The modal clone during a search, one shape matched and one dimmed
    modalClone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    modalClone.setAttribute("viewBox", "0 0 100 100");
    modalClone.setAttribute("class", "dv-searching");
    match = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    match.setAttribute("class", "dv-search-match");
    other = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    other.setAttribute("class", "node");
    modalClone.append(match, other);
    document.body.appendChild(modalClone);

    css = document.createElement("style");
    css.textContent =
      ".dv-searching rect:not(.dv-search-match) { opacity: 0.15; }" +
      ".dv-searching rect.dv-search-match { stroke: rgb(37, 99, 235); }";
    document.head.appendChild(css);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn(() => Promise.resolve()) },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    updateConfig({ security: { mode: "strict" } });
  });

  afterEach(() => {
    container.remove();
    modalClone.remove();
    css.remove();
    updateConfig({ exportSearchHighlight: true });
    jest.clearAllMocks();
  });

  test("is on by default and keeps the search look in the export", async () => {
    expect(state.config.exportSearchHighlight).toBe(true);
    await copySVGCode(container, { modalClone });

    const copied = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copied).toContain("dv-search-match");
    expect(copied).toContain("opacity: 0.15");
    expect(copied).toContain("rgb(37, 99, 235)");
  });

  test("false leaves the search look out and keeps the on-screen search", async () => {
    updateConfig({ exportSearchHighlight: false });
    await copySVGCode(container, { modalClone });

    const copied = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copied).not.toContain("dv-search");
    expect(copied).not.toContain("0.15");
    expect(copied).not.toContain("rgb(37, 99, 235)");
    expect(copied).toContain('class="node"');

    expect(modalClone.getAttribute("class")).toBe("dv-searching");
    expect(match.getAttribute("class")).toBe("dv-search-match");
    expect(getComputedStyle(other).opacity).toBe("0.15");
  });
});

describe("Export embeds self-hosted fonts referenced by relative urls", () => {
  let container, styleEl, fetchMock;

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.innerHTML = '<text style="font-family: DvTest">Label</text>';
    container.appendChild(svg);
    document.body.appendChild(container);

    styleEl = document.createElement("style");
    styleEl.textContent =
      "@font-face { font-family: DvTest; src: url(fonts/x.woff2) format('woff2'), " +
      "url('/fonts/y.woff') format('woff'), url(data:font/woff2;base64,QUJD) format('woff2'), " +
      "url(https://cdn.example.com/z.woff2) format('woff2'); }";
    document.head.appendChild(styleEl);

    // jsdom has neither document.fonts nor a global CSSFontFaceRule
    const rule = document.styleSheets[document.styleSheets.length - 1].cssRules[0];
    global.CSSFontFaceRule = Object.getPrototypeOf(rule).constructor;
    Object.defineProperty(document, "fonts", {
      value: { ready: Promise.resolve() },
      configurable: true,
    });

    fetchMock = jest.fn(async (url) => {
      if (url.includes("cdn.example.com")) throw new TypeError("Failed to fetch");
      return { ok: true, blob: async () => new Blob(["font"], { type: "font/woff2" }) };
    });
    global.fetch = fetchMock;

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn(() => Promise.resolve()) },
      configurable: true,
    });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    updateConfig({ security: { mode: "strict" } });
  });

  afterEach(() => {
    container.remove();
    styleEl.remove();
    delete global.CSSFontFaceRule;
    delete global.fetch;
    delete document.fonts;
    jest.clearAllMocks();
  });

  test("relative and root-relative urls are resolved against the page and inlined", async () => {
    await copySVGCode(container);

    const requested = fetchMock.mock.calls.map((c) => c[0]);
    expect(requested).toContain("http://localhost/fonts/x.woff2");
    expect(requested).toContain("http://localhost/fonts/y.woff");
    // data: URLs are never fetched
    expect(requested.some((u) => u.startsWith("data:"))).toBe(false);

    const text = navigator.clipboard.writeText.mock.calls[0][0];
    expect(text).toContain("@font-face");
    expect(text).not.toContain("url(fonts/x.woff2)");
    expect(text).not.toContain("url('/fonts/y.woff')");
    expect(text).toMatch(/url\('data:font\/woff2;base64,[A-Za-z0-9+/=]+'\)/);
    // the pre-existing data: URL is kept untouched
    expect(text).toContain("data:font/woff2;base64,QUJD");
    // a failed fetch does not fail the export, and strict mode empties that
    // url so the file loads nothing from another server
    expect(text).not.toContain("cdn.example.com");
    expect(text).toContain("url(data:,)");
  });
});

describe("Per-format export functions guard against elements without an <svg>", () => {
  const lastToastText = () =>
    document.getElementById("diagview-toast-container")?.lastChild?.textContent || "";

  afterEach(() => {
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
  });

  test.each([
    ["exportToSVG", exportToSVG],
    ["exportToPNG", exportToPNG],
    ["exportToJPEG", exportToJPEG],
    ["exportToWebP", exportToWebP],
    ["exportToPDF", exportToPDF],
    ["copyToClipboard", copyToClipboard],
  ])("%s resolves and shows a toast instead of throwing", async (_name, fn) => {
    const empty = document.createElement("div");
    document.body.appendChild(empty);
    await expect(fn(empty)).resolves.toBeUndefined();
    expect(lastToastText()).toContain("No diagram found");
    empty.remove();
  });
});

describe("copyToClipboard falls back to download when the clipboard write is denied", () => {
  let container;
  const toastTexts = () =>
    Array.from(document.querySelectorAll("#diagview-toast-container .diagview-toast")).map(
      (t) => t.textContent,
    );

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "strict" } });

    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set(val) {
          this._src = val;
          setTimeout(() => this.onload && this.onload(), 5);
        },
        get() {
          return this._src;
        },
      });
      return img;
    });
    global.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["png"], { type: type || "image/png" }));
    };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: jest.fn(() => Promise.reject(new DOMException("Denied", "NotAllowedError"))),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    container.remove();
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
    delete global.ClipboardItem;
    jest.clearAllMocks();
  });

  test("NotAllowedError triggers the download path and a success toast", async () => {
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await copyToClipboard(container, { filename: "denied" });

    expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    const texts = toastTexts();
    expect(texts.some((t) => /downloaded/i.test(t))).toBe(true);
    expect(texts.some((t) => /Export Failed/i.test(t))).toBe(false);
    clickSpy.mockRestore();
  });
});

describe("exportDiagram honours the filename and silent options", () => {
  let container;
  const toastTexts = () =>
    Array.from(document.querySelectorAll("#diagview-toast-container .diagview-toast")).map(
      (t) => t.textContent,
    );

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "strict" } });

    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set(val) {
          this._src = val;
          setTimeout(() => this.onload && this.onload(), 5);
        },
        get() {
          return this._src;
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };
  });

  afterEach(() => {
    container.remove();
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
    updateConfig({ onExport: null });
    jest.clearAllMocks();
  });

  const captureDownloads = () => {
    const names = [];
    const spy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      names.push(this.download);
    });
    return { names, restore: () => spy.mockRestore() };
  };

  test("a custom filename is used for the download", async () => {
    const dl = captureDownloads();
    await exportDiagram(container, "png", { filename: "arch" });
    dl.restore();
    expect(dl.names).toEqual(["arch.png"]);
  });

  test.each(["svg", "png"])(
    "a %s export of a nested diagram uses the outer title",
    async (mode) => {
      // A .mermaid inside a titled .diagram. The outer one has the toolbar.
      container.className = "diagram";
      container.dataset.title = "Outer title";
      container.dataset.diagviewIndex = "0";
      container.dataset.diagviewInit = "1";
      const inner = document.createElement("div");
      inner.className = "mermaid";
      inner.dataset.diagviewIndex = "1";
      inner.appendChild(container.querySelector("svg"));
      container.appendChild(inner);
      const dl = captureDownloads();
      await exportDiagram(container, mode, { silent: true });
      dl.restore();
      expect(dl.names).toEqual([expect.stringMatching(/^outer_title_\d{4}-\d{2}-\d{2}_\d{6}\./)]);
    },
  );

  test("without a filename the generated name is kept", async () => {
    const dl = captureDownloads();
    await exportDiagram(container, "webp");
    dl.restore();
    expect(dl.names).toHaveLength(1);
    expect(dl.names[0]).toMatch(/\.webp$/);
    expect(dl.names[0]).not.toBe("undefined.webp");
  });

  test("the legacy (element, mode, modalClone) signature still exports", async () => {
    const dl = captureDownloads();
    await exportDiagram(container, "png", container.querySelector("svg").cloneNode(true));
    dl.restore();
    expect(dl.names).toHaveLength(1);
    expect(dl.names[0]).toMatch(/\.png$/);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
  ])("%s options export a PNG with the generated name", async (_label, value) => {
    const dl = captureDownloads();
    await expect(exportDiagram(container, "png", value)).resolves.not.toThrow();
    dl.restore();
    expect(dl.names).toHaveLength(1);
    expect(dl.names[0]).toMatch(/\.png$/);
    expect(dl.names[0]).not.toBe("undefined.png");
    expect(toastTexts().some((t) => /saved/.test(t))).toBe(true);
  });

  test.each(["png", "webp"])("silent skips the Processing toast for %s", async (mode) => {
    const dl = captureDownloads();
    const shown = recordToasts();
    await exportDiagram(container, mode, { filename: "quiet", silent: true });
    dl.restore();
    const texts = shown();
    expect(texts.some((t) => /Processing/.test(t))).toBe(false);
    expect(texts.some((t) => /saved/.test(t))).toBe(true);
  });

  test.each(["png", "webp"])("without silent the Processing toast shows for %s", async (mode) => {
    const dl = captureDownloads();
    const shown = recordToasts();
    await exportDiagram(container, mode, { filename: "loud" });
    dl.restore();
    expect(shown().some((t) => /Processing/.test(t))).toBe(true);
    // The result replaces the progress notice
    expect(toastTexts()).toEqual([expect.stringMatching(/saved/)]);
  });

  test("onExport receives the filename that was used", async () => {
    const onExport = jest.fn();
    updateConfig({ onExport });
    const dl = captureDownloads();
    await exportDiagram(container, "png", { filename: "arch" });
    await exportDiagram(container, "png");
    dl.restore();
    expect(onExport).toHaveBeenNthCalledWith(1, "png", "arch");
    expect(onExport).toHaveBeenNthCalledWith(2, "png", dl.names[1].replace(/\.png$/, ""));
  });
});

describe("Export over performance.criticalFileLimit", () => {
  let container, errorSpy, clickSpy;
  const toastTexts = () =>
    Array.from(document.querySelectorAll("#diagview-toast-container .diagview-toast")).map(
      (t) => t.textContent,
    );

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ performance: { criticalFileLimit: 10 } });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    window.jspdf = { jsPDF: jest.fn() };
  });

  afterEach(() => {
    container.remove();
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
    updateConfig({ performance: { criticalFileLimit: 50000000 } });
    errorSpy.mockRestore();
    clickSpy.mockRestore();
    delete window.jspdf;
  });

  test.each(["svg", "copy-svg", "png", "jpeg", "webp", "copy", "pdf"])(
    "%s shows only the Diagram blocked notice",
    async (mode) => {
      await expect(exportDiagram(container, mode)).resolves.toBe(false);
      const texts = toastTexts();
      expect(texts.filter((t) => t.includes("Diagram blocked"))).toHaveLength(1);
      expect(texts.some((t) => /Failed|intermediate value/.test(t))).toBe(false);
      expect(clickSpy).not.toHaveBeenCalled();
    },
  );

  test("a PDF failure that is not the size limit still shows its notice", async () => {
    // Under the limit the mock jsPDF has no addImage, so the PDF step throws
    updateConfig({ performance: { criticalFileLimit: 50000000 } });
    await exportToPDF(container, {});
    expect(toastTexts().some((t) => /PDF Failed/.test(t))).toBe(true);
  });
});

describe("onExport fires and exportDiagram resolves to true only after a successful export", () => {
  let container, onExport, clickSpy, errorSpy;
  const toastTexts = () =>
    Array.from(document.querySelectorAll("#diagview-toast-container .diagview-toast")).map(
      (t) => t.textContent,
    );
  const mockImage = (fail) => {
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set(val) {
          this._src = val;
          setTimeout(() => (fail ? this.onerror?.() : this.onload?.()), 5);
        },
        get() {
          return this._src;
        },
      });
      return img;
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
    container.appendChild(svg);
    document.body.appendChild(container);
    onExport = jest.fn();
    updateConfig({ highResScale: 1, maxPixels: 16000000, onExport });
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    mockImage(false);
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };
    global.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    container.remove();
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
    updateConfig({ onExport: null, performance: { criticalFileLimit: 50000000 } });
    clickSpy.mockRestore();
    errorSpy.mockRestore();
    delete global.ClipboardItem;
    delete navigator.clipboard;
    delete window.jspdf;
    jest.restoreAllMocks();
  });

  test.each(["png", "jpeg", "webp", "svg"])("a %s download fires it once", async (mode) => {
    expect(await exportDiagram(container, mode, { filename: "ok" })).toBe(true);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith(mode, "ok");
  });

  test.each([
    ["jpeg", { transparent: true }, "png"],
    ["png-transparent", {}, "png"],
    ["webp-transparent", {}, "webp"],
    ["download", {}, "png"],
    ["gif", {}, "png"],
  ])("%s reports the format of the file it made", async (mode, extra, format) => {
    expect(await exportDiagram(container, mode, { filename: "ok", silent: true, ...extra })).toBe(
      true,
    );
    expect(clickSpy.mock.contexts[0].download).toBe(`ok.${format}`);
    expect(onExport).toHaveBeenCalledWith(format, "ok");
  });

  test("Copy Image that downloads the PNG instead still fires it", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    expect(await exportDiagram(container, "copy", { filename: "ok" })).toBe(true);
    expect(toastTexts().some((t) => t.includes("Clipboard unavailable"))).toBe(true);
    expect(onExport).toHaveBeenCalledWith("copy", "ok");
  });

  test.each(["svg", "copy-svg", "png", "copy", "pdf"])(
    "%s blocked by the size limit does not fire it",
    async (mode) => {
      updateConfig({ performance: { criticalFileLimit: 10 } });
      window.jspdf = { jsPDF: jest.fn() };
      expect(await exportDiagram(container, mode)).toBe(false);
      expect(toastTexts().some((t) => t.includes("Diagram blocked"))).toBe(true);
      expect(onExport).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["svg", "SVG Failed"],
    ["copy-svg", "Copy SVG Failed"],
    ["png", "Export Failed"],
  ])("%s that fails while preparing the SVG does not fire it", async (mode, notice) => {
    const ready = Promise.reject(new Error("fonts broke"));
    ready.catch(() => {});
    Object.defineProperty(document, "fonts", { value: { ready }, configurable: true });
    const result = await exportDiagram(container, mode);
    delete document.fonts;
    expect(result).toBe(false);
    expect(toastTexts().some((t) => t.includes(notice))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test.each([
    ["svg", "SVG Failed"],
    ["copy-svg", "Copy SVG Failed"],
    ["png", "Export Failed"],
  ])("%s fails with a notice when the SVG cannot be serialized", async (mode, notice) => {
    const Original = global.XMLSerializer;
    global.XMLSerializer = class {
      serializeToString() {
        throw new Error("serialize broke");
      }
    };
    try {
      expect(await exportDiagram(container, mode, { silent: true })).toBe(false);
    } finally {
      global.XMLSerializer = Original;
    }
    expect(toastTexts().some((t) => t.includes(notice) && t.includes("serialize broke"))).toBe(
      true,
    );
    expect(onExport).not.toHaveBeenCalled();
  });

  test("an image that fails to load does not fire it", async () => {
    mockImage(true);
    expect(await exportDiagram(container, "png")).toBe(false);
    expect(toastTexts().some((t) => t.includes("Export Failed"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test("a tainted canvas does not fire it", async () => {
    HTMLCanvasElement.prototype.toBlob = () => {
      throw new DOMException("Tainted canvases may not be exported", "SecurityError");
    };
    expect(await exportDiagram(container, "png")).toBe(false);
    expect(toastTexts().some((t) => t.includes("Export Failed"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test("a PDF that falls back to PNG because jsPDF did not load does not fire it", async () => {
    // A script tag for the URL already exists, so loadScript resolves without jsPDF
    const url = "https://example.test/jspdf-missing.js";
    updateConfig({ pdfLibraryUrl: url, pdfLibraryIntegrity: null });
    const script = document.createElement("script");
    script.src = url;
    document.head.appendChild(script);
    const result = await exportDiagram(container, "pdf");
    script.remove();
    expect(result).toBe(false);
    expect(toastTexts().some((t) => t.includes("PDF engine unavailable"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test("a PDF whose jsPDF download stalls falls back to PNG after the time limit", async () => {
    // jsdom never fetches the script, so only the time limit ends the wait
    updateConfig({ pdfLibraryUrl: "https://example.test/jspdf-stalled.js" });
    const realTimeout = window.setTimeout;
    const spy = jest
      .spyOn(window, "setTimeout")
      .mockImplementation((fn, ms, ...args) => realTimeout(fn, ms === 15000 ? 0 : ms, ...args));
    let delays;
    try {
      expect(await exportDiagram(container, "pdf")).toBe(false);
    } finally {
      delays = spy.mock.calls.map((call) => call[1]);
      spy.mockRestore();
      document.querySelector('script[src="https://example.test/jspdf-stalled.js"]')?.remove();
    }
    expect(delays).toContain(15000);
    expect(toastTexts().some((t) => t.includes("PDF engine unavailable"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test("a clipboard write that fails does not fire it", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { write: jest.fn(() => Promise.reject(new DOMException("Bad", "DataError"))) },
      configurable: true,
    });
    expect(await exportDiagram(container, "copy")).toBe(false);
    expect(toastTexts().some((t) => t.includes("Export Failed"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  test("an element with no diagram resolves to false", async () => {
    expect(await exportDiagram(document.createElement("div"), "png")).toBe(false);
    expect(toastTexts().some((t) => t.includes("No diagram found"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe("Copy SVG falls back to a download when the clipboard is unavailable", () => {
  let container, onExport, downloads, clickSpy;
  const toastTexts = () =>
    Array.from(document.querySelectorAll("#diagview-toast-container .diagview-toast")).map(
      (t) => t.textContent,
    );
  const setClipboard = (value, secure = true) => {
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });
    Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
  };

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);
    onExport = jest.fn();
    updateConfig({ onExport });
    downloads = [];
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      downloads.push({ name: this.download, href: this.href });
    });
  });

  afterEach(() => {
    container.remove();
    hideToast();
    document.getElementById("diagview-toast-container")?.remove();
    updateConfig({ onExport: null });
    clickSpy.mockRestore();
    delete navigator.clipboard;
    delete document.execCommand;
  });

  const expectSvgDownload = () => {
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("arch.svg");
    expect(decodeURIComponent(downloads[0].href)).toContain("<svg");
    expect(toastTexts().some((t) => t.includes("SVG downloaded (Clipboard unavailable)"))).toBe(
      true,
    );
    expect(toastTexts().some((t) => t.includes("Failed"))).toBe(false);
    expect(onExport).toHaveBeenCalledWith("copy-svg", "arch");
  };

  test("a denied clipboard write downloads the .svg", async () => {
    const writeText = jest.fn(() => Promise.reject(new DOMException("No", "NotAllowedError")));
    setClipboard({ writeText });
    await exportDiagram(container, "copy-svg", { filename: "arch" });
    expect(writeText).toHaveBeenCalledTimes(1);
    expectSvgDownload();
  });

  test("a page without the Clipboard API downloads the .svg when copying is refused", async () => {
    setClipboard(undefined, false);
    document.execCommand = jest.fn(() => false);
    await exportDiagram(container, "copy-svg", { filename: "arch" });
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expectSvgDownload();
  });

  test("execCommand copy that works does not download", async () => {
    setClipboard(undefined, false);
    document.execCommand = jest.fn(() => true);
    await exportDiagram(container, "copy-svg", { filename: "arch" });
    expect(downloads).toHaveLength(0);
    expect(toastTexts()).toContain("SVG Code copied to clipboard!");
    expect(onExport).toHaveBeenCalledWith("copy-svg", "arch");
  });

  test("copySVGCode names the fallback download from the diagram without a filename", async () => {
    setClipboard(undefined, false);
    await copySVGCode(container);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^diagram_export_.*\.svg$/);
  });

  test("any other clipboard error still shows Copy SVG Failed", async () => {
    setClipboard({ writeText: jest.fn(() => Promise.reject(new TypeError("broken"))) });
    await exportDiagram(container, "copy-svg", { filename: "arch" });
    expect(downloads).toHaveLength(0);
    expect(toastTexts().some((t) => t.includes("Copy SVG Failed"))).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe("generateFilename", () => {
  const name = (html) => {
    document.body.innerHTML = html;
    return generateFilename(document.querySelector("svg")).replace(/_\d{4}-\d{2}-\d{2}_\d{6}$/, "");
  };
  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  test("data-title wins over the SVG's own title", () => {
    expect(
      name(`<div data-diagview-index="0" data-title="Checkout sequence">
        <svg ${NS}><title>Order pipeline</title></svg></div>`),
    ).toBe("checkout_sequence");
  });

  test("a shape's tooltip title does not name the file", () => {
    // PlantUML and Graphviz put a <title> on every shape
    expect(
      name(`<div data-diagview-index="0"><svg ${NS}><g><title>Bob</title></g></svg></div>`),
    ).toBe("diagram_export");
    expect(
      name(`<div data-diagview-index="0" data-title="Checkout sequence">
        <svg ${NS}><g><title>Bob</title></g></svg></div>`),
    ).toBe("checkout_sequence");
  });

  test("the SVG's own title names the file when there is no data-title", () => {
    expect(
      name(`<div data-diagview-index="0"><svg ${NS}><title>Order pipeline</title></svg></div>`),
    ).toBe("order_pipeline");
  });

  test("a Mermaid chart title names the file", () => {
    expect(
      name(
        `<div data-diagview-index="0"><svg ${NS}><text class="flowchartTitleText">Order flow</text></svg></div>`,
      ),
    ).toBe("order_flow");
  });

  test("with no title at all the file is diagram_export", () => {
    expect(name(`<div data-diagview-index="0"><svg ${NS}><rect/></svg></div>`)).toBe(
      "diagram_export",
    );
  });

  // A .mermaid inside a titled .diagram. Both keep an index, only the outer
  // one gets the toolbar and shows its title in the header.
  const NESTED = `<div class="diagram" data-title="Outer title" data-diagview-index="0">
    <div class="mermaid" data-diagview-index="1"><svg ${NS}><rect/></svg></div></div>`;

  test("a nested diagram takes the title of the element with the toolbar", () => {
    expect(name(NESTED.replace('data-diagview-index="0"', '$& data-diagview-init="1"'))).toBe(
      "outer_title",
    );
  });

  test("before init the element passed to the export gives the title", () => {
    document.body.innerHTML = NESTED;
    const outer = document.querySelector(".diagram");
    expect(generateFilename(outer.querySelector("svg"), outer)).toMatch(
      /^outer_title_\d{4}-\d{2}-\d{2}_\d{6}$/,
    );
  });

  test("a wrapper that is not a diagram does not hide the diagram's title", () => {
    const plain = `<div data-diagview-index="0" data-title="Own title"><svg ${NS}></svg></div>`;
    document.body.innerHTML = `<section>${plain}</section>`;
    expect(
      generateFilename(document.querySelector("svg"), document.querySelector("section")),
    ).toMatch(/^own_title_/);
  });
});

describe("Linked images left out of image and PDF files", () => {
  const NS = "http://www.w3.org/2000/svg";
  const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  let container, svg, onExport, clickSpy;

  const image = (attr, url) => {
    const el = document.createElementNS(NS, "image");
    el.setAttribute("width", "10");
    el.setAttribute("height", "10");
    if (attr === "xlink:href") el.setAttributeNS("http://www.w3.org/1999/xlink", attr, url);
    else el.setAttribute(attr, url);
    svg.appendChild(el);
  };
  const htmlLabel = (src) => {
    const fo = document.createElementNS(NS, "foreignObject");
    const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    img.setAttribute("src", src);
    div.appendChild(img);
    fo.appendChild(div);
    svg.appendChild(fo);
  };
  const run = async (mode, options) => {
    const stop = recordToasts();
    const ok = await exportDiagram(container, mode, { filename: "f", ...options });
    return { ok, seen: stop() };
  };

  beforeEach(() => {
    container = document.createElement("div");
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);
    onExport = jest.fn();
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "strict" }, onExport });
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set() {
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };
    global.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };
    Object.defineProperty(navigator, "clipboard", {
      value: { write: jest.fn(() => Promise.resolve()) },
      configurable: true,
    });
    window.jspdf = { jsPDF: jest.fn(() => ({ addImage: jest.fn(), save: jest.fn() })) };
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    container.remove();
    clickSpy.mockRestore();
    hideToast();
    updateConfig({ onExport: null });
    delete global.ClipboardItem;
    delete navigator.clipboard;
    delete window.jspdf;
  });

  test("a PNG with one linked image warns in place of the saved notice", async () => {
    image("href", PIXEL);
    image("href", "logo.png");
    const { ok, seen } = await run("png");
    expect(seen).toContain(
      "1.0x PNG saved, but 1 linked image was left out. Only embedded images can go into image files.",
    );
    expect(seen).not.toContain("1.0x PNG saved");
    expect(ok).toBe(true);
    expect(onExport).toHaveBeenCalledWith("png", "f");
  });

  test("counts xlink:href images and images in HTML labels", async () => {
    image("xlink:href", "https://example.com/a.png");
    htmlLabel("b.png");
    htmlLabel(PIXEL);
    const { seen } = await run("webp");
    expect(seen).toContain(
      "1.0x WebP saved, but 2 linked images were left out. Only embedded images can go into image files.",
    );
  });

  test.each([
    ["copy", "Copied to clipboard, but 1 linked image was left out."],
    [
      "pdf",
      "PDF saved, but 1 linked image was left out. Only embedded images can go into PDF files.",
    ],
  ])("%s warns too", async (mode, text) => {
    image("href", "logo.png");
    const { ok, seen } = await run(mode);
    expect(seen.some((t) => t.startsWith(text))).toBe(true);
    expect(ok).toBe(true);
    expect(onExport).toHaveBeenCalledWith(mode, "f");
  });

  test.each([
    ["an SVG export", "svg", {}, "SVG saved"],
    ["a silent export", "png", { silent: true }, "1.0x PNG saved"],
  ])("%s keeps the plain notice", async (_name, mode, options, notice) => {
    image("href", "logo.png");
    const { ok, seen } = await run(mode, options);
    expect(seen).toContain(notice);
    expect(seen.some((t) => t.includes("linked image"))).toBe(false);
    expect(ok).toBe(true);
  });

  test("embedded images alone keep the plain notice", async () => {
    image("href", PIXEL);
    htmlLabel(PIXEL);
    const { seen } = await run("png");
    expect(seen).toContain("1.0x PNG saved");
  });
});

describe("The notice when the browser will not read the canvas back", () => {
  const NS = "http://www.w3.org/2000/svg";
  let container, svg, errorSpy, clickSpy;

  const add = (tag, attrs, text = "") => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.textContent = text;
    svg.appendChild(el);
  };
  const notice = async () => {
    const stop = recordToasts();
    const ok = await exportDiagram(container, "png");
    return { ok, seen: stop() };
  };

  beforeEach(() => {
    container = document.createElement("div");
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    container.appendChild(svg);
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000, security: { mode: "permissive" } });
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set() {
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = () => {
      throw new DOMException("Tainted canvases may not be exported", "SecurityError");
    };
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    container.remove();
    errorSpy.mockRestore();
    clickSpy.mockRestore();
    hideToast();
    updateConfig({ security: { mode: "strict" } });
  });

  test.each([
    ["an HTML label", () => add("foreignObject", {}, "label")],
    ["an image on the same site", () => add("image", { href: "logo.png" })],
    ["an embedded image", () => add("image", { href: "data:image/png;base64,AAAA" })],
    ["a link to another site", () => add("a", { href: "https://example.com/" })],
  ])("with %s it is the plain failure notice", async (_name, setup) => {
    setup();
    const { ok, seen } = await notice();
    expect(ok).toBe(false);
    expect(seen).toContain("Export Failed: Tainted canvases may not be exported");
    expect(seen.some((t) => t.includes("cross-origin"))).toBe(false);
  });

  test.each([
    ["an image", () => add("image", { href: "https://example.com/a.png" })],
    ["a protocol-relative image", () => add("image", { href: "//example.com/a.png" })],
    ["a CSS url()", () => add("style", {}, "rect { mask: url(https://example.com/m.png); }")],
    ["an @import", () => add("style", {}, '@import "https://example.com/a.css";')],
  ])("with %s from another site it names the cross-origin cause", async (_name, setup) => {
    setup();
    const { ok, seen } = await notice();
    expect(ok).toBe(false);
    expect(seen.some((t) => t.startsWith("Export blocked by cross-origin image"))).toBe(true);
  });

  test("the SVG file keeps an image from another site as it was", async () => {
    add("image", { href: "https://example.com/a.png" });
    let downloaded = "";
    clickSpy.mockImplementation(function () {
      downloaded = decodeURIComponent(this.href);
    });
    await exportDiagram(container, "svg");
    expect(downloaded).toContain('href="https://example.com/a.png"');
    expect(downloaded).not.toContain("crossorigin");
  });
});

describe("backgroundColor transparent in formats without transparency", () => {
  let container, fills, fillSpy;

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.innerHTML = '<rect width="50" height="50"/>';
    container.appendChild(svg);
    document.body.appendChild(container);
    document.body.style.backgroundColor = "rgb(243, 234, 215)";
    updateConfig({ highResScale: 1, maxPixels: 16000000, backgroundColor: "transparent" });
    state.themeCache = null;

    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set() {
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      cb(new Blob(["img"], { type: type || "image/png" }));
    };
    window.jspdf = {
      jsPDF: class {
        addImage() {}
        save() {}
      },
    };
    fills = [];
    fillSpy = jest
      .spyOn(CanvasRenderingContext2D.prototype, "fillRect")
      .mockImplementation(function () {
        // The 1x1 canvas that reads colours is not the export
        if (this.canvas.width > 1) fills.push(this.fillStyle);
      });
  });

  afterEach(() => {
    container.remove();
    fillSpy.mockRestore();
    delete window.jspdf;
    document.body.style.backgroundColor = "";
    updateConfig({ backgroundColor: null });
    state.themeCache = null;
    hideToast();
  });

  test.each([
    ["JPEG", exportToJPEG],
    ["PDF", exportToPDF],
  ])("a %s gets the page colour instead of black", async (_name, fn) => {
    await fn(container, { filename: "d" });
    expect(fills).toEqual(["#f3ead7"]);
  });

  test("a PNG keeps the see-through background", async () => {
    await exportToPNG(container, { filename: "d" });
    expect(fills).toEqual(["rgba(0, 0, 0, 0)"]);
  });
});

describe("PDF page size", () => {
  let container, pages, images;

  const render = async (w, h) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = '<rect width="50" height="50"/>';
    container.replaceChildren(svg);
    await exportToPDF(container, { filename: "d" });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    updateConfig({ highResScale: 1, maxPixels: 16000000 });
    global.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = jest.fn();
    global.Image = jest.fn(() => {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", {
        set() {
          setTimeout(() => this.onload && this.onload(), 5);
        },
      });
      return img;
    });
    pages = [];
    images = [];
    window.jspdf = {
      jsPDF: class {
        constructor(orientation, unit, format) {
          pages.push({ orientation, unit, format });
        }
        addImage(data, type, x, y, w, h) {
          images.push([x, y, w, h]);
        }
        save() {}
      },
    };
  });

  afterEach(() => {
    container.remove();
    delete window.jspdf;
    hideToast();
  });

  // The export adds a margin of 5% of the long side all round
  const sizes = () => {
    expect(pages).toHaveLength(1);
    expect(images).toHaveLength(1);
    const [w, h] = pages[0].format;
    // The image always fills the page exactly
    expect(images[0]).toEqual([0, 0, w, h]);
    return [w, h];
  };

  test("a diagram within the page limit keeps its size", async () => {
    await render(800, 400);
    expect(pages[0].unit).toBe("px");
    expect(pages[0].orientation).toBe("l");
    expect(sizes()).toEqual([880, 480]);
  });

  test("a very wide diagram shrinks page and image together to fit 14400 pt", async () => {
    await render(20000, 1000);
    const [w, h] = sizes();
    // 10800 px is 14400 pt in jsPDF's px unit. Unscaled it is 22000 x 3000.
    expect(w).toBe(10800);
    expect(h).toBeCloseTo((10800 * 3000) / 22000, 6);
    expect(pages[0].orientation).toBe("l");
  });

  test("a very tall diagram shrinks the same way", async () => {
    await render(500, 21600);
    const [w, h] = sizes();
    // Unscaled it is 2660 x 23760
    expect(h).toBe(10800);
    expect(w).toBeCloseTo((10800 * 2660) / 23760, 6);
    expect(pages[0].orientation).toBe("p");
  });
});
