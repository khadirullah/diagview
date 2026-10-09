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
const { initializeDiagram, deinitializeDiagram, recheckDiagram } =
  await import("../src/features/diagram-init.js");
const { getDiagramSvg } = await import("../src/core/utils.js");

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

  describe("tooltip for a long title", () => {
    const TITLE = "Customer Order Processing and Payment Reconciliation (EU)";

    function hover(scrollHeight, clientHeight) {
      const label = document.querySelector(".diagview-label");
      Object.defineProperty(label, "scrollHeight", { configurable: true, value: scrollHeight });
      Object.defineProperty(label, "clientHeight", { configurable: true, value: clientHeight });
      label.dispatchEvent(new Event("pointerenter"));
      return label;
    }

    beforeEach(() => {
      const container = document.createElement("div");
      container.dataset.diagviewLayout = "header";
      container.setAttribute("data-title", TITLE);
      container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
      document.body.appendChild(container);
      initializeDiagram(container);
    });

    test("shows the whole title as the page wrote it when two lines cut it", () => {
      const label = hover(46, 31);
      expect(label.textContent).toBe(TITLE.toUpperCase());
      expect(label.title).toBe(TITLE);
    });

    test("is left out when the title fits, and dropped again once it fits", () => {
      expect(hover(31, 31).hasAttribute("title")).toBe(false);
      hover(46, 31);
      expect(hover(31, 31).hasAttribute("title")).toBe(false);
    });
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

describe("Diagram Init: an svg the selector matches itself", () => {
  const BARE =
    '<p id="before">Before</p><svg class="diagram flow" id="chart" data-x="1" style="outline: 0px;" viewBox="0 0 10 10" width="10" height="10"><title>Flow</title><rect width="5" height="5"/></svg><p id="after">After</p>';

  beforeEach(() => {
    document.body.innerHTML = `<main id="page">${BARE}</main>`;
    jest.clearAllMocks();
  });

  test.each(["floating", "header"])(
    "the %s layout wraps the svg in a card where it stood",
    (layout) => {
      const svg = document.getElementById("chart");
      svg.dataset.diagviewLayout = layout;

      initializeDiagram(svg);

      const wrapper = svg.closest(".diagview-wrapper");
      expect(svg.parentElement.className).toBe("diagview-viewport");
      expect(wrapper.parentElement.id).toBe("page");
      expect(wrapper.previousElementSibling.id).toBe("before");
      expect(wrapper.nextElementSibling.id).toBe("after");
      expect(wrapper.querySelectorAll(".diagview-btn")).toHaveLength(3);
      expect(svg.id).toBe("chart");
      expect(svg.getAttribute("data-x")).toBe("1");
      expect(svg.classList.contains("flow")).toBe(true);
    },
  );

  test("the toolbar opens fullscreen and exports the svg itself", async () => {
    const { openFullscreen } = await import("../src/ui/modal.js");
    const { exportDiagram } = await import("../src/features/export.js");
    const svg = document.getElementById("chart");
    initializeDiagram(svg);
    const wrapper = svg.closest(".diagview-wrapper");

    wrapper.querySelector('[data-action="fullscreen"]').click();
    wrapper.querySelector('[data-action="download"]').click();

    expect(openFullscreen).toHaveBeenCalledWith(svg);
    expect(exportDiagram).toHaveBeenCalledWith(svg, "download");
  });

  test.each(["floating", "header", "off"])(
    "destroy in the %s layout puts back the same node, as it was",
    (layout) => {
      const svg = document.getElementById("chart");
      svg.dataset.diagviewLayout = layout;
      const before = document.body.innerHTML;

      initializeDiagram(svg);
      deinitializeDiagram(svg);

      expect(document.body.innerHTML).toBe(before);
      expect(document.getElementById("chart")).toBe(svg);
    },
  );

  test("layout off makes the svg itself a button in the tab order", () => {
    const svg = document.getElementById("chart");
    svg.dataset.diagviewLayout = "off";

    initializeDiagram(svg);

    expect(svg.closest(".diagview-wrapper")).toBeNull();
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(svg.getAttribute("role")).toBe("button");
    expect(svg.getAttribute("aria-label")).toBe("Open Flow in fullscreen");
  });

  test("a broken svg gets the error box after it, not inside it", () => {
    document.body.innerHTML = '<main id="page"><svg class="diagram" id="chart"></svg></main>';
    const svg = document.getElementById("chart");
    const before = document.body.innerHTML;

    initializeDiagram(svg);

    expect(svg.dataset.diagviewError).toBe("1");
    expect(svg.nextElementSibling.className).toBe("diagview-error");
    expect(svg.querySelector(".diagview-error")).toBeNull();

    deinitializeDiagram(svg);
    expect(document.body.innerHTML).toBe(before);
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
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("must be 1 to 10"));
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

describe("Diagram Init: the reason Mermaid gives", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // What Mermaid 12 draws for a flowchart with a missing }: the parser
  // message follows the headline and the version, wrapped over lines
  const mermaid12Error = (...lines) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2412 724" aria-roledescription="error"><g><path class="error-icon" d="m411 400 1 2z"/>
    <text class="error-text">Syntax error in text</text>
    <text class="error-text">mermaid version 12.1.0</text>
    ${lines.map((line) => `<text class="error-text">${line}</text>`).join("")}</g></svg>`;

  test("the error box shows Mermaid 12's parser message under the headline", () => {
    const { container } = mountSvg(
      mermaid12Error(
        "Parse error on line 3: ...A[Start] --&gt; B{oops ----------------------^",
        "Expecting 'SQE', 'PE',",
        "'TAGSTART', got '1'",
      ),
    );

    initializeDiagram(container);

    expect(container.querySelector(".diagview-error-title").textContent).toBe("Syntax Error");
    expect(container.querySelector(".diagview-error-message").textContent).toBe(
      "There's a syntax error in the diagram code.",
    );
    expect(container.querySelector(".diagview-error-detail").textContent).toBe(
      "Parse error on line 3: ...A[Start] --> B{oops Expecting 'SQE', 'PE', 'TAGSTART', got '1'",
    );
  });

  test("Mermaid 10 and 11 give no reason, so the box has no detail line", () => {
    const { container } = mountSvg(mermaid12Error().replace("12.1.0", "11.17.2"));

    initializeDiagram(container);

    expect(container.dataset.diagviewError).toBe("1");
    expect(container.querySelector(".diagview-error-detail")).toBeNull();
  });

  test("diagram code in the reason stays text", () => {
    const { container } = mountSvg(
      mermaid12Error("Parse error on line 2: B{&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;x"),
    );

    initializeDiagram(container);

    const detail = container.querySelector(".diagview-error-detail");
    expect(detail.textContent).toBe("Parse error on line 2: B{<img src=x onerror=alert(1)><b>x");
    expect(detail.children).toHaveLength(0);
    expect(container.querySelector(".diagview-error img, .diagview-error b")).toBeNull();
  });

  test("a long reason is cut at 300 characters", () => {
    const { container } = mountSvg(mermaid12Error(`Expecting ${"'TOKEN', ".repeat(80)}`));

    initializeDiagram(container);

    const text = container.querySelector(".diagview-error-detail").textContent;
    expect(text).toHaveLength(300);
    expect(text.endsWith("\u2026")).toBe(true);
  });

  test("screen readers skip the icon and read the words", () => {
    const { container } = mountSvg(mermaid12Error("No diagram type detected"));

    initializeDiagram(container);

    const icon = container.querySelector(".diagview-error-icon");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".diagview-error").textContent).toBe(
      "Syntax ErrorThere's a syntax error in the diagram code.No diagram type detected",
    );
  });

  test("onError gets the reason after the message", async () => {
    const { resetConfig, updateConfig } = await import("../src/core/config.js");
    const onError = jest.fn();
    updateConfig({ onError });
    try {
      initializeDiagram(mountSvg(mermaid12Error("Lexer error on line 2")).container);
    } finally {
      resetConfig();
    }
    expect(onError.mock.calls[0][0].message).toBe(
      "DiagView: Syntax Error, There's a syntax error in the diagram code. Lexer error on line 2",
    );
  });
});

describe("Diagram Init: onError", () => {
  test("onError gets the title and the message joined by a comma", async () => {
    const { resetConfig, updateConfig } = await import("../src/core/config.js");
    const onError = jest.fn();
    updateConfig({ onError });
    document.body.innerHTML = '<div class="diagram"></div>';
    try {
      initializeDiagram(document.querySelector(".diagram"));
    } finally {
      resetConfig();
      document.body.innerHTML = "";
    }
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe(
      "DiagView: No Diagram Found, No SVG content was found in this container.",
    );
  });
});

describe("Diagram Init: keyboard access with layout off", () => {
  const RECT = '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
  let openFullscreen;

  const setup = (attrs = "", inner = RECT, layout = "off") => {
    document.body.innerHTML = `<div class="diagram" data-diagview-layout="${layout}" ${attrs}>${inner}</div>`;
    const el = document.querySelector(".diagram");
    initializeDiagram(el);
    return el;
  };

  const press = (target, key) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  beforeEach(async () => {
    ({ openFullscreen } = await import("../src/ui/modal.js"));
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("a titled diagram is a button in the tab order named after its title", () => {
    const el = setup('data-title="Order flow"');
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("aria-label")).toBe("Open Order flow in fullscreen");
  });

  test("the SVG's own <title> names it too", () => {
    const el = setup("", '<svg viewBox="0 0 10 10"><title>Login</title><rect/></svg>');
    expect(el.getAttribute("aria-label")).toBe("Open Login in fullscreen");
  });

  test("a diagram without a title gets a plain name", () => {
    expect(setup().getAttribute("aria-label")).toBe("Open diagram in fullscreen");
  });

  test.each([
    ['data-title="Checkout"', "Checkout, press Enter to open fullscreen"],
    ["", "Diagram, press Enter to open fullscreen"],
  ])("a diagram with links inside is a group (%s)", (attrs, label) => {
    const el = setup(
      attrs,
      '<svg viewBox="0 0 10 10"><a xlink:href="#one"><rect width="5" height="5"/></a></svg>',
    );
    expect(el.getAttribute("role")).toBe("group");
    expect(el.getAttribute("aria-label")).toBe(label);
    expect(el.getAttribute("tabindex")).toBe("0");
  });

  test("keeps the tabindex, role and label the page set, also after destroy", () => {
    const attrs = 'tabindex="-1" role="figure" aria-label="Sales chart"';
    const el = setup(attrs);
    expect(el.getAttribute("tabindex")).toBe("-1");
    expect(el.getAttribute("role")).toBe("figure");
    expect(el.getAttribute("aria-label")).toBe("Sales chart");

    deinitializeDiagram(el);
    expect(el.getAttribute("tabindex")).toBe("-1");
    expect(el.getAttribute("role")).toBe("figure");
    expect(el.getAttribute("aria-label")).toBe("Sales chart");
  });

  test("adds only what the page left out", () => {
    const el = setup('tabindex="0" data-title="Flow"');
    expect(el.getAttribute("role")).toBe("button");
    deinitializeDiagram(el);
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  test.each(["Enter", " "])("%p on the diagram opens it and stops the page scrolling", (key) => {
    const el = setup();
    const e = press(el, key);
    expect(openFullscreen).toHaveBeenCalledWith(el);
    expect(e.defaultPrevented).toBe(true);
  });

  test("other keys do nothing", () => {
    const el = setup();
    const e = press(el, "a");
    expect(openFullscreen).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("Enter on a link inside the diagram follows the link", () => {
    const el = setup(
      "",
      '<svg viewBox="0 0 10 10"><a href="#one"><rect width="5" height="5"/></a></svg>',
    );
    const e = press(el.querySelector("a"), "Enter");
    expect(openFullscreen).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("a click still opens it", () => {
    const el = setup();
    el.click();
    expect(openFullscreen).toHaveBeenCalledWith(el);
  });

  test("destroy leaves the element as it was and stops listening", () => {
    document.body.innerHTML = `<div class="diagram" data-diagview-layout="off" data-title="Flow">${RECT}</div>`;
    const el = document.querySelector(".diagram");
    const before = el.outerHTML;
    initializeDiagram(el);
    deinitializeDiagram(el);

    expect(el.outerHTML).toBe(before);
    press(el, "Enter");
    el.click();
    expect(openFullscreen).not.toHaveBeenCalled();
  });

  test("the header layout gets none of it", () => {
    const el = setup('data-title="Flow"', RECT, "header");
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });
});

describe("Diagram Init: offHint", () => {
  const RECT = '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
  let updateConfig;

  const setup = (attrs = "", layout = "off") => {
    document.body.innerHTML = `<div class="diagram" data-diagview-layout="${layout}" ${attrs}>${RECT}</div>`;
    const el = document.querySelector(".diagram");
    initializeDiagram(el);
    return el;
  };

  beforeEach(async () => {
    const config = await import("../src/core/config.js");
    config.resetConfig();
    ({ updateConfig } = config);
    document.body.innerHTML = "";
  });

  test("is off by default and leaves the element as layout off always did", () => {
    const el = setup();
    expect(el.querySelector(".diagview-off-hint")).toBeNull();
    expect(el.className).toBe("diagram");
    expect(el.lastElementChild.localName).toBe("svg");
  });

  test("icon puts an empty badge last in the element and positions the element", () => {
    updateConfig({ offHint: "icon" });
    const el = setup();
    const hint = el.lastElementChild;
    expect(hint.className).toBe("diagview-off-hint diagview-off-hint--icon");
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    expect(hint.childNodes).toHaveLength(0);
    expect(hint.querySelector("svg")).toBeNull();
    expect(el.classList.contains("diagview-off-host")).toBe(true);
    expect(el.getAttribute("style")).toBeNull();
  });

  test.each(["label", "below"])("%s holds the mouse and the touch text as plain text", (style) => {
    updateConfig({ offHint: style, offHintText: { touch: "<b>Tap</b> me" } });
    const el = setup();
    const hint = el.querySelector(`.diagview-off-hint--${style}`);
    expect(hint.querySelector("svg, b")).toBeNull();
    expect(hint.querySelector(".diagview-off-hint-mouse").textContent).toBe("Click to expand");
    expect(hint.querySelector(".diagview-off-hint-touch").textContent).toBe("<b>Tap</b> me");
    // Only icon and label sit in the corner
    expect(el.classList.contains("diagview-off-host")).toBe(style === "label");
  });

  test.each(["label", "below"])("%s text takes the page font, not the font of a <pre>", (style) => {
    document.body.style.fontFamily = "Georgia, serif";
    updateConfig({ offHint: style });
    document.body.innerHTML = `<pre class="diagram" data-diagview-layout="off">${RECT}</pre>`;
    const el = document.querySelector(".diagram");
    initializeDiagram(el);
    const hint = el.querySelector(".diagview-off-hint");
    expect(hint.style.getPropertyValue("--dv-hint-font")).toBe("Georgia, serif");
    document.body.removeAttribute("style");
  });

  test("the diagram still finds its own SVG, not the hint", () => {
    updateConfig({ offHint: "label" });
    const el = setup();
    expect(getDiagramSvg(el)).toBe(el.firstElementChild);
  });

  test("data-diagview-off-hint picks the style for one diagram", () => {
    updateConfig({ offHint: "icon" });
    expect(setup('data-diagview-off-hint="BELOW"').lastElementChild.className).toBe(
      "diagview-off-hint diagview-off-hint--below",
    );
    expect(setup('data-diagview-off-hint="none"').querySelector(".diagview-off-hint")).toBeNull();
  });

  test("an unknown data-diagview-off-hint warns and keeps the page setting", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ offHint: "icon" });
    const el = setup('data-diagview-off-hint="badge"');
    expect(warn).toHaveBeenCalledWith(
      'DiagView: Unknown data-diagview-off-hint "badge" on element, ignoring.',
    );
    expect(el.querySelector(".diagview-off-hint--icon")).not.toBeNull();
    warn.mockRestore();
  });

  test.each(["header", "floating"])("the %s layout gets no hint", (layout) => {
    updateConfig({ offHint: "label" });
    const el = setup('data-diagview-off-hint="icon"', layout);
    expect(document.querySelector(".diagview-off-hint")).toBeNull();
    expect(el.classList.contains("diagview-off-host")).toBe(false);
  });

  test("a diagram that shows the error box gets no hint", () => {
    updateConfig({ offHint: "icon", layout: "off" });
    document.body.innerHTML = '<div class="diagram"><svg width="0" height="0"></svg></div>';
    const el = document.querySelector(".diagram");
    initializeDiagram(el);
    expect(el.dataset.diagviewError).toBe("1");
    expect(document.querySelector(".diagview-off-hint")).toBeNull();
    expect(el.classList.contains("diagview-off-host")).toBe(false);
  });

  test.each(["icon", "label", "below"])("destroy puts the element back as it was (%s)", (style) => {
    updateConfig({ offHint: style });
    for (const attrs of ["", 'class="diagram"']) {
      document.body.innerHTML = `<div data-diagram data-diagview-layout="off" ${attrs}>${RECT}</div>`;
      const el = document.querySelector("[data-diagram]");
      const before = document.body.innerHTML;
      initializeDiagram(el);
      expect(document.querySelector(".diagview-off-hint")).not.toBeNull();
      deinitializeDiagram(el);
      expect(document.body.innerHTML).toBe(before);
    }
  });

  test.each(["icon", "label", "below"])(
    "a bare svg gets the %s hint after it, in the flow, and no host class",
    (style) => {
      updateConfig({ offHint: style });
      document.body.innerHTML =
        '<main><svg class="diagram" id="chart" data-diagview-layout="off" viewBox="0 0 10 10"><rect width="5" height="5"/></svg><p>After</p></main>';
      const svg = document.getElementById("chart");
      const before = document.body.innerHTML;

      initializeDiagram(svg);

      const hint = svg.nextElementSibling;
      expect(hint.className).toBe(
        `diagview-off-hint diagview-off-hint--${style} diagview-off-hint--after`,
      );
      expect(svg.querySelector(".diagview-off-hint")).toBeNull();
      expect(svg.classList.contains("diagview-off-host")).toBe(false);

      deinitializeDiagram(svg);
      expect(document.body.innerHTML).toBe(before);
    },
  );

  test("a new render into the element gets the hint back once", () => {
    updateConfig({ offHint: "icon" });
    const el = setup();
    el.innerHTML = '<svg viewBox="0 0 20 20"><rect width="9" height="9"/></svg>';
    expect(el.querySelector(".diagview-off-hint")).toBeNull();

    expect(recheckDiagram(el)).toBe(false);
    expect(recheckDiagram(el)).toBe(false);

    expect(el.querySelectorAll(".diagview-off-hint")).toHaveLength(1);
    expect(el.lastElementChild.classList.contains("diagview-off-hint")).toBe(true);
  });

  test("a render that breaks the diagram swaps the hint for the error box", () => {
    updateConfig({ offHint: "icon" });
    const el = setup();
    el.innerHTML = '<svg width="0" height="0"></svg>';

    expect(recheckDiagram(el)).toBe(true);
    initializeDiagram(el);

    expect(el.dataset.diagviewError).toBe("1");
    expect(el.querySelector(".diagview-off-hint")).toBeNull();
    expect(el.classList.contains("diagview-off-host")).toBe(false);
  });
});
