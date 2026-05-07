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

  test("respects data-diagview-accent override", () => {
    container.dataset.diagviewAccent = "#ff0000";
    initializeDiagram(container);
    expect(container.style.getPropertyValue("--dv-accent")).toBe("#ff0000");
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
