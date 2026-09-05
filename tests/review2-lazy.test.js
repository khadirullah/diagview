/**
 * Review round 2 — lazy feature fixes
 * Covers: viewBox-less SVG validity (diagram-init) and stylesheet rules.
 * The stylesheet checks are textual: jsdom does not lay out CSS, and the
 * visual behaviour is covered by the headless Chrome sweep in tests/e2e.
 */

import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/styles.css");
const css = readFileSync(cssPath, "utf8");

// Body of the first rule whose selector text contains `selector`
function ruleBody(selector, from = 0) {
  const idx = css.indexOf(selector, from);
  if (idx === -1) return null;
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("styles.css: desktop tooltip", () => {
  test("is placed below the element so the topbar button's tooltip is not clipped", () => {
    const body = ruleBody("[data-tooltip]::after");
    expect(body).not.toBeNull();
    expect(body).toMatch(/top:\s*calc\(100% \+ 8px\)/);
    expect(body).not.toMatch(/bottom:\s*calc/);
  });
});

describe("styles.css: dead and contradicting rules", () => {
  test("never-emitted helper classes are gone", () => {
    expect(css).not.toContain(".dv-selection-allowed");
    expect(css).not.toContain(".dv-exp-trans-hint");
  });

  test("dv-pulse keyframes carry no invalid brightness property", () => {
    const start = css.indexOf("@keyframes dv-pulse");
    const end = css.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(-1);
    expect(css.slice(start, end)).not.toMatch(/brightness\s*:/);
  });

  test("per-control outline rules that always lose to the global focus ring are gone", () => {
    for (const sel of [
      ".dv-icon-btn:focus-visible",
      ".dv-text-select-btn:focus-visible",
      ".diagview-close-btn:focus-visible",
      ".dv-exp-trans-chk:focus-visible",
    ]) {
      expect(css).not.toContain(sel);
    }
    // the shared box-shadow ring stays
    expect(ruleBody(".diagview-modal *:focus-visible")).toMatch(/box-shadow/);
  });

  test("help modal z-index is clamped to the 32-bit maximum", () => {
    expect(ruleBody(".diagview-help-modal {")).toMatch(/z-index:\s*2147483647;/);
    expect(css).not.toContain("2147483648");
  });

  test("mobile closed-search rule outranks the later base rule", () => {
    const mobile = css.indexOf("@media (max-width: 639px)");
    const base = css.indexOf("\n.diagview-search-container {");
    expect(mobile).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(mobile);
    const body = ruleBody(".diagview-topbar .diagview-search-container {", mobile);
    expect(body).not.toBeNull();
    expect(body).toMatch(/flex:\s*0;/);
    expect(body).toMatch(/max-width:\s*0;/);
  });

  test("reduced-motion rule covers the modal and pseudo-elements but keeps the spinner spinning", () => {
    const idx = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const open = css.indexOf("{", css.indexOf(".diagview-modal", idx));
    const selector = css.slice(idx, open);
    expect(selector).toMatch(/\.diagview-modal,/);
    expect(selector).toMatch(/\.diagview-modal \*:not\(\.diagview-spinner\)/);
    expect(selector).toMatch(/\.diagview-modal \*::before/);
    expect(selector).toMatch(/\.diagview-modal \*::after/);
  });
});
