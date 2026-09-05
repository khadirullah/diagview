/**
 * Review round 2 — lazy feature fixes
 * Covers: viewBox-less SVG validity (diagram-init).
 */

import { jest } from "@jest/globals";

jest.unstable_mockModule("../src/ui/modal.js", () => ({
  createModal: jest.fn(),
  openFullscreen: jest.fn(),
}));

jest.unstable_mockModule("../src/features/export.js", () => ({
  exportDiagram: jest.fn(),
}));

const { initializeDiagram } = await import("../src/features/diagram-init.js");

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
