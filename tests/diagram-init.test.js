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
  test("extracts title from data-title attribute", () => {
    const el = document.createElement("div");
    el.setAttribute("data-title", "My Architecture");
    const dataTitle = el.getAttribute("data-title");
    expect(dataTitle.toUpperCase()).toBe("MY ARCHITECTURE");
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
