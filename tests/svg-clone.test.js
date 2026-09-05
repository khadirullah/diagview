import { jest } from "@jest/globals";
import {
  cloneSVG,
  cloneSVGForExportAsync,
  cloneSVGForModal,
  resolveElementSecurity,
} from "../src/core/svg-clone.js";
import { state, resetConfig, updateConfig } from "../src/core/config.js";

describe("per-element security overrides in clone presets", () => {
  const ns = "http://www.w3.org/2000/svg";
  let dirty;

  beforeEach(() => {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagviewSanitize = "permissive";
    container.dataset.diagviewAllowRemote = "true";

    dirty = document.createElementNS(ns, "svg");
    dirty.setAttribute("viewBox", "0 0 10 10");
    const style = document.createElementNS(ns, "style");
    style.textContent = "@import url(https://fonts.googleapis.com/css?family=Inter);";
    dirty.appendChild(style);
    const animate = document.createElementNS(ns, "animate");
    animate.setAttribute("attributeName", "x");
    animate.setAttribute("values", "0;1");
    dirty.appendChild(animate);

    container.appendChild(dirty);
    document.body.appendChild(container);
  });

  afterEach(() => {
    resetConfig();
    document.body.innerHTML = "";
  });

  const hasRemoteImport = (clone) =>
    Array.from(clone.querySelectorAll("style")).some((s) => s.textContent.includes("@import"));

  test("export clone honours data-diagview-sanitize and data-diagview-allow-remote like the modal clone", async () => {
    const modal = cloneSVGForModal(dirty);
    expect(modal.querySelector("animate")).not.toBeNull();
    expect(hasRemoteImport(modal)).toBe(true);

    const exported = await cloneSVGForExportAsync(dirty);
    expect(exported.querySelector("animate")).not.toBeNull();
    expect(hasRemoteImport(exported)).toBe(true);
  });

  test("security.allowOverrides:false ignores per-element overrides in both paths", async () => {
    updateConfig({ security: { allowOverrides: false } });

    const modal = cloneSVGForModal(dirty);
    expect(modal.querySelector("animate")).toBeNull();
    expect(hasRemoteImport(modal)).toBe(false);

    const exported = await cloneSVGForExportAsync(dirty);
    expect(exported.querySelector("animate")).toBeNull();
    expect(hasRemoteImport(exported)).toBe(false);
  });
});

describe("SVG Cloning Utilities", () => {
  let svg;

  beforeEach(() => {
    // Setup a mock SVG
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.setAttribute("viewBox", "0 0 100 100");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "10");
    rect.setAttribute("y", "10");
    rect.setAttribute("width", "80");
    rect.setAttribute("height", "80");
    rect.setAttribute("class", "test-rect");
    svg.appendChild(rect);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", "50");
    text.setAttribute("y", "50");
    text.textContent = "Hello World";
    svg.appendChild(text);

    // Mock getComputedStyle for "baking" test
    window.getComputedStyle = jest.fn().mockReturnValue({
      getPropertyValue: (prop) => {
        if (prop === "fill") return "rgb(255, 0, 0)";
        if (prop === "stroke") return "none";
        return "";
      },
    });

    document.body.appendChild(svg);
  });

  afterEach(() => {
    if (svg && svg.parentNode) {
      document.body.removeChild(svg);
    }
    jest.clearAllMocks();
  });

  test("cloneSVGForModal preserves text and basic structure but does not bake styles", () => {
    const clone = cloneSVGForModal(svg);
    expect(clone).not.toBe(svg);
    expect(clone.querySelector("rect")).toBeTruthy();
    expect(clone.querySelector("rect").style.fill).toBe(""); // Not baked
    expect(clone.hasAttribute("xmlns")).toBe(true);
  });

  test("cloneSVGForExportAsync bakes computed styles into inline styles", async () => {
    const clone = await cloneSVGForExportAsync(svg);
    const clonedRect = clone.querySelector(".test-rect");

    expect(clonedRect.style.fill).toBe("rgb(255, 0, 0)");
    expect(clone.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(clone.getAttribute("xmlns:xlink")).toBe("http://www.w3.org/1999/xlink");
  });

  test("text preservation adds textLength for consistent rendering", () => {
    // Mock getBBox for text element
    const textEl = svg.querySelector("text");
    textEl.getBBox = jest.fn().mockReturnValue({ x: 50, y: 50, width: 60, height: 20 });

    const clone = cloneSVGForModal(svg);
    const clonedText = clone.querySelector("text");

    // OPT-1: textLength is no longer forced in loops to prevent layout thrashing
    expect(clonedText.getAttribute("textLength")).toBeNull();
    expect(clonedText.style.whiteSpace).toBe("nowrap");
  });

  test("cloneSVG correctly handles missing input", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const clone = cloneSVG(null);
    expect(clone).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No SVG provided"));
    consoleSpy.mockRestore();
  });

  test("sanitizer-removed nodes do not shift baked styles onto wrong elements", () => {
    // A blocked tag (<animate>, removed in strict mode) sits BEFORE the
    // styled elements. With post-sanitization positional matching, its
    // removal shifted every subsequent original<->clone pair by one.
    const ns = "http://www.w3.org/2000/svg";
    const dirty = document.createElementNS(ns, "svg");
    dirty.setAttribute("viewBox", "0 0 100 100");

    const animate = document.createElementNS(ns, "animate");
    animate.setAttribute("attributeName", "x");
    dirty.appendChild(animate);

    const circleA = document.createElementNS(ns, "circle");
    circleA.setAttribute("class", "a");
    dirty.appendChild(circleA);
    const circleB = document.createElementNS(ns, "circle");
    circleB.setAttribute("class", "b");
    dirty.appendChild(circleB);
    document.body.appendChild(dirty);

    window.getComputedStyle = jest.fn((el) => ({
      getPropertyValue: (prop) => {
        if (prop !== "fill") return "";
        if (el === circleA) return "rgb(1, 1, 1)";
        if (el === circleB) return "rgb(2, 2, 2)";
        return "";
      },
    }));

    const clone = cloneSVG(dirty, { preserveStyles: true, securityMode: "strict" });
    document.body.removeChild(dirty);

    expect(clone.querySelector("animate")).toBeNull(); // removed by sanitizer
    expect(clone.querySelector(".a").style.fill).toBe("rgb(1, 1, 1)");
    expect(clone.querySelector(".b").style.fill).toBe("rgb(2, 2, 2)");
  });

  test("style content removed by the sanitizer is not re-injected by copyStyleElements", () => {
    const ns = "http://www.w3.org/2000/svg";
    const dirty = document.createElementNS(ns, "svg");
    dirty.setAttribute("viewBox", "0 0 10 10");

    const evilStyle = document.createElementNS(ns, "style");
    evilStyle.textContent = '@import url("javascript:alert(1)");';
    dirty.appendChild(evilStyle);

    const goodStyle = document.createElementNS(ns, "style");
    goodStyle.textContent = ".safe { fill: red; }";
    dirty.appendChild(goodStyle);
    document.body.appendChild(dirty);

    const clone = cloneSVG(dirty, { securityMode: "strict" });
    document.body.removeChild(dirty);

    const styles = Array.from(clone.querySelectorAll("style"));
    expect(styles.some((s) => s.textContent.includes("javascript:"))).toBe(false);
    expect(styles.some((s) => s.textContent.includes(".safe"))).toBe(true);
  });
});

describe("Per-element security overrides (allowOverrides gate)", () => {
  let container, svg;

  beforeEach(() => {
    resetConfig();
    container = document.createElement("div");
    container.className = "diagram";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const script = document.createElementNS("http://www.w3.org/2000/svg", "script");
    script.textContent = "alert(1)";
    svg.appendChild(script);
    container.appendChild(svg);
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    resetConfig();
  });

  test("resolveElementSecurity honours data attributes when allowOverrides is true", () => {
    container.dataset.diagviewSanitize = "permissive";
    container.dataset.diagviewAllowRemote = "true";
    const sec = resolveElementSecurity(container);
    expect(sec.mode).toBe("permissive");
    expect(sec.allowRemoteResources).toBe(true);
  });

  test("resolveElementSecurity ignores data attributes when allowOverrides is false", () => {
    updateConfig({ security: { allowOverrides: false } });
    container.dataset.diagviewSanitize = "off";
    container.dataset.diagviewAllowRemote = "true";
    const sec = resolveElementSecurity(container);
    expect(sec.mode).toBe("strict");
    expect(sec.allowRemoteResources).toBe(false);
  });

  test("resolveElementSecurity ignores unknown modes and non-true remote values", () => {
    container.dataset.diagviewSanitize = "yolo";
    container.dataset.diagviewAllowRemote = "yes";
    const sec = resolveElementSecurity(container);
    expect(sec.mode).toBe("strict");
    expect(sec.allowRemoteResources).toBe(false);
    expect(resolveElementSecurity(null).mode).toBe("strict");
  });

  test("cloneSVGForModal still sanitizes when allowOverrides is false and element says off", () => {
    updateConfig({ security: { allowOverrides: false } });
    container.dataset.diagviewSanitize = "off";
    const clone = cloneSVGForModal(svg);
    expect(clone.querySelector("script")).toBeNull();
    expect(state.config.security.allowOverrides).toBe(false);
  });

  test("cloneSVGForModal honours element off when allowOverrides is true", () => {
    container.dataset.diagviewSanitize = "off";
    const clone = cloneSVGForModal(svg);
    expect(clone.querySelector("script")).not.toBeNull();
  });
});

describe("criticalFileLimit size guard in clone presets", () => {
  const ns = "http://www.w3.org/2000/svg";
  let svg;
  let errorSpy;

  beforeEach(() => {
    svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    for (let i = 0; i < 20; i++) {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("width", "1");
      svg.appendChild(rect);
    }
    document.body.appendChild(svg);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    resetConfig();
    document.body.innerHTML = "";
  });

  test("cloneSVG returns null when the SVG exceeds performance.criticalFileLimit", () => {
    updateConfig({ performance: { criticalFileLimit: 50 } });
    expect(cloneSVG(svg)).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    // Original untouched
    expect(svg.querySelectorAll("rect")).toHaveLength(20);
  });

  test("cloneSVG accepts an explicit maxChars option", () => {
    expect(cloneSVG(svg, { maxChars: 50 })).toBeNull();
    expect(cloneSVG(svg, { maxChars: svg.outerHTML.length + 100 })).not.toBeNull();
  });

  test("cloneSVG clones normally under the limit", () => {
    const clone = cloneSVG(svg);
    expect(clone).not.toBeNull();
    expect(clone.querySelectorAll("rect")).toHaveLength(20);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("modal and export presets resolve null over the limit", async () => {
    updateConfig({ performance: { criticalFileLimit: 50 } });
    expect(cloneSVGForModal(svg)).toBeNull();
    await expect(cloneSVGForExportAsync(svg)).resolves.toBeNull();
    // Export path must clean its match-id markers off the original even when blocked
    expect(svg.querySelectorAll("[data-dv-match-id]")).toHaveLength(0);
  });
});
