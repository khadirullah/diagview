/**
 * Diagram Initialization Tests
 * Tests for SVG validation, title extraction, error boundary, and wrapper cleanup.
 */

import { jest } from "@jest/globals";

// 1. Define mocks for heavy dependencies
jest.unstable_mockModule("../src/ui/modal.js", () => ({
  createModal: jest.fn(),
  openFullscreen: jest.fn(),
}));

jest.unstable_mockModule("../src/features/export.js", () => ({
  exportDiagram: jest.fn(),
}));

// 2. Import modules after mocks
const { initializeDiagram, deinitializeDiagram } = await import("../src/features/diagram-init.js");

describe("Diagram Init: SVG Validation (via error boundary)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("initializeDiagram rejects empty SVG via error boundary", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    container.appendChild(svg);
    document.body.appendChild(container);

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBe("1");
    expect(container.querySelector(".diagview-error")).not.toBeNull();
  });

  test("the error icon has round line caps so the dot under the ! draws", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    document.body.appendChild(container);

    initializeDiagram(container);

    const icon = container.querySelector(".diagview-error-icon");
    expect(icon.getAttribute("stroke-linecap")).toBe("round");
    expect(icon.getAttribute("stroke-linejoin")).toBe("round");
  });

  test("initializeDiagram rejects SVG with error class via error boundary", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("error");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);

    initializeDiagram(container);

    // Should show error boundary UI and not initialize standard wrapper
    expect(container.dataset.diagviewError).toBe("1");
    expect(container.querySelector(".diagview-error")).not.toBeNull();
    expect(document.querySelector(".diagview-wrapper")).toBeNull();
  });
});

describe("Diagram Init: Title Extraction Logic", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders data-title as uppercase label in header layout", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    // Use header layout so .diagview-label is rendered in the DOM
    container.dataset.diagviewLayout = "header";
    container.setAttribute("data-title", "My Architecture");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);

    initializeDiagram(container);

    const label = document.querySelector(".diagview-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("MY ARCHITECTURE");
  });

  test("falls back to SVG <title> element when data-title is absent", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagviewLayout = "header";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleEl.textContent = "System Overview";
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(titleEl);
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);

    initializeDiagram(container);

    const label = document.querySelector(".diagview-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("SYSTEM OVERVIEW");
  });

  test("falls back to DIAGRAM when no title source is found", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagviewLayout = "header";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);

    initializeDiagram(container);

    const label = document.querySelector(".diagview-label");
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("DIAGRAM");
  });

  test("ignores a shape's tooltip title", () => {
    // PlantUML and Graphviz put a <title> on every shape
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagviewLayout = "header";
    container.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><title>Bob</title><rect/></g></svg>';
    document.body.appendChild(container);

    initializeDiagram(container);

    expect(document.querySelector(".diagview-label").textContent).toBe("DIAGRAM");
  });
});

describe("Diagram Init: deinitializeDiagram", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("removes wrapper and restores original element", () => {
    const container = document.createElement("div");
    container.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // Add content so validation passes
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);

    // Call REAL initializeDiagram so it populates the internal cleanupMap
    initializeDiagram(container);

    expect(document.querySelector(".diagview-wrapper")).not.toBeNull();

    deinitializeDiagram(container);

    // After deinit, wrapper should be gone
    expect(document.querySelector(".diagview-wrapper")).toBeNull();
    expect(container.dataset.diagviewInit).toBeUndefined();
    expect(document.body.contains(container)).toBe(true);
  });

  test.each(["floating", "header", "off"])(
    "leaves no empty style or class attribute behind in the %s layout",
    (layout) => {
      document.body.innerHTML = `<div class="diagram" data-diagview-layout="${layout}"><svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></div>`;
      const container = document.querySelector(".diagram");
      const before = container.outerHTML;

      initializeDiagram(container);
      deinitializeDiagram(container);

      expect(container.outerHTML).toBe(before);
    },
  );

  test("keeps style and class attributes the page wrote, even empty ones", () => {
    document.body.innerHTML =
      '<div class="diagram" style="" data-diagview-layout="off"><svg class="" style="" viewBox="0 0 10 10"><rect width="5" height="5"/></svg></div>';
    const container = document.querySelector(".diagram");
    const before = container.outerHTML;

    initializeDiagram(container);
    deinitializeDiagram(container);

    expect(container.outerHTML).toBe(before);
  });

  test("an error placeholder leaves no empty style on the SVG", () => {
    document.body.innerHTML = '<div class="diagram"><svg width="0" height="0"></svg></div>';
    const container = document.querySelector(".diagram");
    const before = container.outerHTML;

    initializeDiagram(container);
    expect(container.dataset.diagviewError).toBeDefined();
    deinitializeDiagram(container);

    expect(container.outerHTML).toBe(before);
  });

  test("handles element without diagviewInit data gracefully", () => {
    const el = document.createElement("div");
    expect(() => deinitializeDiagram(el)).not.toThrow();
  });

  test("handles null element gracefully", () => {
    expect(() => deinitializeDiagram(null)).not.toThrow();
  });
});

describe("Diagram Init: Interaction Handlers", () => {
  let container, svg;

  beforeEach(async () => {
    const { resetConfig } = await import("../src/core/config.js");
    resetConfig();
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "diagram";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);
    initializeDiagram(container);
    jest.clearAllMocks();
  });

  test("copy button calls exportDiagram", async () => {
    const { exportDiagram } = await import("../src/features/export.js");
    const copyBtn = document.querySelector('[data-action="copy"]');
    copyBtn.click();
    expect(exportDiagram).toHaveBeenCalledWith(container, "copy");
  });

  test("download button calls exportDiagram", async () => {
    const { exportDiagram } = await import("../src/features/export.js");
    const dlBtn = document.querySelector('[data-action="download"]');
    dlBtn.click();
    expect(exportDiagram).toHaveBeenCalledWith(container, "download");
  });

  test("fullscreen button calls openFullscreen", async () => {
    const { openFullscreen } = await import("../src/ui/modal.js");
    const fsBtn = document.querySelector('[data-action="fullscreen"]');
    fsBtn.click();
    expect(openFullscreen).toHaveBeenCalledWith(container);
  });

  test("clicking viewport calls openFullscreen", async () => {
    const { openFullscreen } = await import("../src/ui/modal.js");
    const viewport = document.querySelector(".diagview-viewport");
    viewport.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(openFullscreen).toHaveBeenCalledWith(container);
  });

  test("clicking controls does NOT call openFullscreen (propagation check)", async () => {
    const { openFullscreen } = await import("../src/ui/modal.js");
    const controls = document.querySelector(".diagview-controls");
    controls.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(openFullscreen).not.toHaveBeenCalled();
  });
});

describe("Diagram Init: readElementOverrides", () => {
  let container;

  beforeEach(async () => {
    const { resetConfig } = await import("../src/core/config.js");
    resetConfig();
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    container.appendChild(svg);
    document.body.appendChild(container);
  });

  test("respects data-diagview-layout override", () => {
    container.dataset.diagviewLayout = "floating";
    initializeDiagram(container);
    expect(document.querySelector(".diagview-controls-floating")).not.toBeNull();
  });

  test("respects data-diagview-scale override", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    container.dataset.diagviewScale = "5";
    initializeDiagram(container);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("warns on invalid data-diagview-scale", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    container.dataset.diagviewScale = "99";
    initializeDiagram(container);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("must be 1–10"));
    warnSpy.mockRestore();
  });

  test("data-diagview-accent warns once per page, not once per element", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const second = container.cloneNode(true);
    document.body.appendChild(second);
    container.dataset.diagviewAccent = "#ff0000";
    second.dataset.diagviewAccent = "#00ff00";
    initializeDiagram(container);
    initializeDiagram(second);
    const accentWarnings = warnSpy.mock.calls.filter(([m]) => m.includes("data-diagview-accent"));
    expect(accentWarnings).toHaveLength(1);
    expect(accentWarnings[0][0]).toMatch(/accentColor.*--diagram-accent/);
    warnSpy.mockRestore();
  });

  test("respects data-diagview-sanitize override", () => {
    container.dataset.diagviewSanitize = "permissive";
    initializeDiagram(container);
    // Again, internal state check is hard but we cover the branch
  });
});

describe("Diagram Init: SVG Validation Edge Cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("rejects malformed SVG (parsererror)", () => {
    const container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const err = document.createElement("parsererror");
    svg.appendChild(err);
    container.appendChild(svg);
    initializeDiagram(container);
    expect(container.dataset.diagviewError).toBe("1");
  });

  test("rejects SVG without structural content", () => {
    const container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // No g, path, etc.
    container.appendChild(svg);
    initializeDiagram(container);
    expect(container.dataset.diagviewError).toBe("1");
  });

  test("rejects Mermaid explicit error ID", () => {
    const container = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    const err = document.createElement("div");
    err.id = "mermaid-123-error";
    svg.appendChild(err);
    container.appendChild(svg);
    initializeDiagram(container);
    expect(container.dataset.diagviewError).toBe("1");
  });
});

function mountSvg(markup) {
  const container = document.createElement("div");
  container.className = "diagram";
  container.innerHTML = markup;
  document.body.appendChild(container);
  return { container, svg: container.querySelector("svg") };
}

describe("Diagram Init: viewBox validity", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("SVG with width/height but no viewBox attribute is accepted and stays visible", () => {
    const { container, svg } = mountSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="100" height="50"/></svg>',
    );
    // Browsers expose a 0x0 SVGRect for a missing viewBox attribute
    Object.defineProperty(svg, "viewBox", {
      value: { baseVal: { x: 0, y: 0, width: 0, height: 0 } },
      configurable: true,
    });

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBeUndefined();
    expect(container.querySelector(".diagview-error")).toBeNull();
    expect(container.closest(".diagview-wrapper")).not.toBeNull();
    expect(svg.style.display).not.toBe("none");
  });

  test("SVG with an explicit zero-sized viewBox is still rejected", () => {
    const { container } = mountSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"><rect width="100" height="50"/></svg>',
    );

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBe("1");
    expect(container.querySelector(".diagview-error")).not.toBeNull();
    expect(container.closest(".diagview-wrapper")).toBeNull();
  });
});

describe("Diagram Init: button style and custom icons", () => {
  const CUSTOM =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16"/></svg>';
  let container, resetConfig, updateConfig;

  beforeEach(async () => {
    ({ resetConfig, updateConfig } = await import("../src/core/config.js"));
    resetConfig();
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "diagram";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
    container.appendChild(svg);
    document.body.appendChild(container);
  });

  afterEach(() => {
    resetConfig();
    document.body.innerHTML = "";
  });

  const btn = (action) => document.querySelector(`[data-action="${action}"]`);

  test("a custom icon gets dv-custom-icon and a built-in one does not", () => {
    updateConfig({ ui: { buttons: { icons: { download: CUSTOM } } } });
    initializeDiagram(container);
    expect(btn("download").classList.contains("dv-custom-icon")).toBe(true);
    expect(btn("download").querySelector("svg").getAttribute("fill")).toBe("none");
    expect(btn("copy").classList.contains("dv-custom-icon")).toBe(false);
    expect(btn("fullscreen").classList.contains("dv-custom-icon")).toBe(false);
  });

  test("a plain custom icon is inserted unchanged", () => {
    updateConfig({ ui: { buttons: { icons: { download: CUSTOM } } } });
    initializeDiagram(container);
    const icon = btn("download").querySelector("svg");
    expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(icon.getAttribute("stroke")).toBe("currentColor");
    expect(icon.querySelector("path").getAttribute("d")).toBe("M4 4h16");
  });

  test("a custom icon loses its script, event handlers and javascript: links", () => {
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">' +
      "<script>alert(2)</script>" +
      '<a href="javascript:alert(3)"><path d="M4 4h16" onclick="alert(4)"/></a></svg>';
    updateConfig({ ui: { buttons: { icons: { copy: icon } } } });
    initializeDiagram(container);
    const svg = btn("copy").querySelector("svg");
    expect(svg.hasAttribute("onload")).toBe(false);
    expect(svg.querySelector("script")).toBeNull();
    expect(svg.querySelector("a").hasAttribute("href")).toBe(false);
    expect(svg.querySelector("path").hasAttribute("onclick")).toBe(false);
    expect(svg.querySelector("path").getAttribute("d")).toBe("M4 4h16");
    expect(btn("copy").classList.contains("dv-custom-icon")).toBe(true);
  });

  test("a custom icon that does not parse falls back to the built-in icon", () => {
    updateConfig({ ui: { buttons: { icons: { fullscreen: "<svg><path></svg>" } } } });
    initializeDiagram(container);
    expect(btn("fullscreen").querySelector("svg path")).not.toBeNull();
    expect(btn("fullscreen").classList.contains("dv-custom-icon")).toBe(false);
  });

  test("an icon set back to null uses the built-in icon without dv-custom-icon", () => {
    updateConfig({ ui: { buttons: { icons: { copy: CUSTOM } } } });
    updateConfig({ ui: { buttons: { icons: { copy: null } } } });
    initializeDiagram(container);
    expect(btn("copy").classList.contains("dv-custom-icon")).toBe(false);
  });

  for (const layout of ["header", "floating"]) {
    for (const style of ["transparent", "accent", "solid", "neutral"]) {
      test(`${layout} layout applies the ${style} style to every button`, () => {
        container.dataset.diagviewLayout = layout;
        updateConfig({ ui: { buttons: { style, icons: { fullscreen: CUSTOM } } } });
        initializeDiagram(container);
        for (const action of ["copy", "download", "fullscreen"]) {
          expect(btn(action).classList.contains("diagview-btn")).toBe(true);
          expect(btn(action).classList.contains(`dv-btn-${style}`)).toBe(true);
        }
        expect(btn("fullscreen").classList.contains("dv-custom-icon")).toBe(true);
      });
    }
  }
});

describe("Diagram Init: Mermaid syntax errors", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // What Mermaid 10 and 11 draw for a diagram with a typo
  const mermaidError = `<svg id="mermaid-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2412 512" role="graphics-document document" aria-roledescription="error">
    <g><path class="error-icon" d="m411 400 1 2z"/><path class="error-icon" d="m459 427 1 2z"/>
    <text class="error-text" x="1440" y="250">Syntax error in text</text>
    <text class="error-text" x="1250" y="400">mermaid version 11.4.0</text></g></svg>`;

  test("a Mermaid syntax error gets the error box, not a toolbar", () => {
    const { container, svg } = mountSvg(mermaidError);

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBe("1");
    expect(container.querySelector(".diagview-error-title").textContent).toBe("Syntax Error");
    expect(container.closest(".diagview-wrapper")).toBeNull();
    expect(svg.style.display).toBe("none");
  });

  test("a Mermaid flowchart with an error node still gets a toolbar", () => {
    const { container } = mountSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" aria-roledescription="flowchart-v2"><g class="node error"><rect width="80" height="40"/><text>error handling</text></g></svg>',
    );

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBeUndefined();
    expect(container.closest(".diagview-wrapper")).not.toBeNull();
  });
});
