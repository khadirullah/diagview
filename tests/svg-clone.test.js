import { jest } from "@jest/globals";
import { cloneSVG, cloneSVGForExportAsync, cloneSVGForModal } from "../src/core/svg-clone.js";

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
