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
} from "../src/features/export.js";
import { hideToast } from "../src/ui/toast.js";
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

describe("Export embeds self-hosted fonts referenced by relative urls", () => {
  let container, styleEl, fetchMock;

  beforeEach(() => {
    container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
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
    // a failed fetch leaves that url alone and does not fail the export
    expect(text).toContain("https://cdn.example.com/z.woff2");
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
    await exportDiagram(container, mode, { filename: "quiet", silent: true });
    dl.restore();
    const texts = toastTexts();
    expect(texts.some((t) => /Processing/.test(t))).toBe(false);
    expect(texts.some((t) => /saved/.test(t))).toBe(true);
  });

  test.each(["png", "webp"])("without silent the Processing toast shows for %s", async (mode) => {
    const dl = captureDownloads();
    await exportDiagram(container, mode, { filename: "loud" });
    dl.restore();
    expect(toastTexts().some((t) => /Processing/.test(t))).toBe(true);
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
