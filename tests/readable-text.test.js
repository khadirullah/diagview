/**
 * Readable Text Tests
 * Recolouring of hard-to-read labels in the modal, its restore, and the
 * "Text Colours" menu toggle.
 */

import { jest } from "@jest/globals";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import * as theme from "../src/core/theme.js";
import {
  applyReadableText,
  restoreText,
  withOriginalText,
  syncReadableText,
} from "../src/features/lazy/readable-text.js";
import { createFloatingMenu } from "../src/ui/floating-menu.js";
import { configure, destroy, init } from "../src/index.js";

const NS = "http://www.w3.org/2000/svg";
const DARK = "#0b0f19";
const LIGHT = "#ffffff";

// jsdom has no layout, so every element reports the box it is given here
function place(el, x, y, w, h) {
  el.getBoundingClientRect = () => ({
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
  });
  return el;
}

function add(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (tag === "text" || tag === "tspan") el.appendChild(document.createTextNode("label"));
  parent.appendChild(el);
  return el;
}

// An HTML element inside a foreignObject. data-color and data-bg stand in
// for colours that would come from the diagram's stylesheet.
function addHtml(parent, attrs = {}, text = "") {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.appendChild(document.createTextNode(text));
  parent.appendChild(el);
  return el;
}

// Computed style from inline style first, then attributes, like the cascade
// would give for these tests
function computed(el) {
  const inline = (prop) => el.style?.getPropertyValue(prop) || "";
  return {
    // fill inherits from the parent text, as SVG does
    fill:
      inline("fill") ||
      el.getAttribute?.("fill") ||
      (el.localName === "tspan" ? computed(el.parentNode).fill : "rgb(0, 0, 0)"),
    fillOpacity: el.getAttribute?.("fill-opacity") || "1",
    color: inline("color") || el.getAttribute?.("data-color") || "rgb(0, 0, 0)",
    backgroundColor: inline("background-color") || el.getAttribute?.("data-bg") || "",
    getPropertyValue: () => "",
  };
}

const rgbOf = (value) => value.match(/\d+/g).slice(0, 3).map(Number);

function hueOf(value) {
  const [r, g, b] = rgbOf(value).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  let h;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let svg;

beforeEach(() => {
  resetConfig();
  theme.clearThemeCache();
  document.body.innerHTML = "";
  svg = place(document.createElementNS(NS, "svg"), 0, 0, 1000, 1000);
  document.body.appendChild(svg);
  jest.spyOn(window, "getComputedStyle").mockImplementation(computed);
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
});

describe("Readable text: theme helpers", () => {
  test("the old text contrast pass is gone and the colour helpers are exported", () => {
    expect(theme.normalizeSvgTextContrast).toBeUndefined();
    expect(theme.parseColor("#ff0000")).toEqual([255, 0, 0]);
    expect(theme.getContrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
  });
});

describe("Readable text: which labels change", () => {
  test("dark text straight on a dark canvas is recoloured well clear of the limit", () => {
    const text = place(add("text", { fill: "#333333" }, svg), 10, 10, 60, 12);

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(text.style.getPropertyPriority("fill")).toBe("important");
    // 7:1, not just over 4.5:1, so grey text does not turn a dim mid grey
    expect(
      theme.getContrastRatio(text.style.getPropertyValue("fill"), DARK),
    ).toBeGreaterThanOrEqual(7);
  });

  test("a dark label inside a light node stays dark on a dark canvas", () => {
    place(add("rect", { fill: "#000000" }, svg), 0, 0, 1000, 1000);
    place(add("rect", { fill: "#ececff" }, svg), 100, 100, 200, 80);
    const label = place(add("text", { fill: "#333333" }, svg), 150, 130, 100, 20);

    expect(applyReadableText(svg, DARK)).toBe(0);
    expect(label.style.getPropertyValue("fill")).toBe("");
  });

  test("the node's fill opacity lets the canvas show through", () => {
    place(add("rect", { fill: "#ffffff", "fill-opacity": "0.1" }, svg), 100, 100, 200, 80);
    const label = place(add("text", { fill: "#333333" }, svg), 150, 130, 100, 20);

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(label.style.getPropertyValue("fill")).not.toBe("");
  });

  test("an HTML label inside a foreignObject is recoloured through color", () => {
    const fo = add("foreignObject", {}, svg);
    const label = place(addHtml(fo, { "data-color": "#333333" }, "Label"), 10, 10, 60, 12);

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(label.style.getPropertyValue("color")).not.toBe("");
    expect(label.style.getPropertyValue("fill")).toBe("");
  });

  test("an HTML label with its own background is checked against that background", () => {
    const fo = add("foreignObject", {}, svg);
    const box = addHtml(fo, { "data-bg": "rgba(232, 232, 232, 0.8)" });
    const dark = place(addHtml(box, { "data-color": "#333333" }, "Yes"), 10, 10, 30, 12);
    const fo2 = add("foreignObject", {}, svg);
    const box2 = addHtml(fo2, { "data-bg": "rgb(232, 232, 232)" });
    const light = place(addHtml(box2, { "data-color": "#eeeeee" }, "No"), 300, 10, 30, 12);

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(dark.style.getPropertyValue("color")).toBe("");
    const recoloured = light.style.getPropertyValue("color");
    expect(theme.getContrastRatio(recoloured, "rgb(232, 232, 232)")).toBeGreaterThanOrEqual(4.5);
  });

  test("red text on a dark canvas becomes a lighter red", () => {
    const text = place(add("text", { fill: "#cc0000" }, svg), 10, 10, 60, 12);

    applyReadableText(svg, DARK);
    const value = text.style.getPropertyValue("fill");
    const [r, g, b] = rgbOf(value);
    const hue = hueOf(value);

    expect(Math.min(hue, 360 - hue)).toBeLessThan(4);
    expect(r).toBeGreaterThan(g);
    expect(g).toBe(b);
    expect(theme.getContrastRatio(value, DARK)).toBeGreaterThanOrEqual(4.5);
  });

  test("light text on a light canvas becomes darker", () => {
    const text = place(add("text", { fill: "#dddddd" }, svg), 10, 10, 60, 12);

    expect(applyReadableText(svg, LIGHT)).toBe(1);
    const value = text.style.getPropertyValue("fill");
    expect(theme.getContrastRatio(value, LIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(rgbOf(value)[0]).toBeLessThan(0xdd);
  });

  test("gradient text and text over a gradient-filled shape are left alone", () => {
    const gradientText = place(add("text", { fill: "url(#g)" }, svg), 10, 10, 60, 12);
    place(add("rect", { fill: "url(#p)" }, svg), 100, 100, 200, 80);
    const overGradient = place(add("text", { fill: "#333333" }, svg), 150, 130, 100, 20);

    expect(applyReadableText(svg, DARK)).toBe(0);
    expect(gradientText.style.getPropertyValue("fill")).toBe("");
    expect(overGradient.style.getPropertyValue("fill")).toBe("");
  });

  test("labels that are not drawn and transparent labels are skipped", () => {
    const hidden = place(add("text", { fill: "#333333" }, svg), 10, 10, 0, 12);
    const none = place(add("text", { fill: "none" }, svg), 10, 40, 60, 12);
    const clear = place(add("text", { fill: "rgba(51, 51, 51, 0)" }, svg), 10, 70, 60, 12);

    expect(applyReadableText(svg, DARK)).toBe(0);
    for (const el of [hidden, none, clear]) {
      expect(el.style.getPropertyValue("fill")).toBe("");
    }
  });

  test("a tspan with its own fill is checked on its own", () => {
    const text = place(add("text", { fill: "#ffffff" }, svg), 10, 10, 200, 12);
    const plain = place(add("tspan", {}, text), 10, 10, 50, 12);
    const own = place(add("tspan", { fill: "#222222" }, text), 70, 10, 50, 12);

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(text.style.getPropertyValue("fill")).toBe("");
    expect(plain.style.getPropertyValue("fill")).toBe("");
    expect(own.style.getPropertyValue("fill")).not.toBe("");
  });
});

describe("Readable text: labels painted by their tspans", () => {
  test("a text whose characters all sit in tspans is left to its tspans", () => {
    const box = place(add("rect", { fill: "#ececff" }, svg), 0, 0, 200, 40);
    // Mermaid actor names: the tspan paints the name through a stylesheet
    // and the text itself carries a fill that would not read on the box
    const text = place(document.createElementNS(NS, "text"), 20, 10, 100, 14);
    text.setAttribute("fill", "#f0f0f0");
    svg.appendChild(text);
    const name = place(add("tspan", { fill: "#000000" }, text), 20, 10, 100, 14);

    expect(applyReadableText(svg, DARK)).toBe(0);
    expect(text.getAttribute("style")).toBeNull();
    expect(name.getAttribute("style")).toBeNull();
    expect(box.getAttribute("style")).toBeNull();
  });

  test("restore leaves no empty style attribute behind", () => {
    const text = place(add("text", { fill: "#111111" }, svg), 10, 10, 60, 12);
    expect(applyReadableText(svg, DARK)).toBe(1);
    restoreText(svg);
    expect(text.hasAttribute("style")).toBe(false);
  });
});

describe("Readable text: restore", () => {
  test("restore puts back the original inline value and priority", () => {
    const text = place(add("text", {}, svg), 10, 10, 60, 12);
    text.style.setProperty("fill", "#111111", "important");

    expect(applyReadableText(svg, DARK)).toBe(1);
    expect(text.style.getPropertyValue("fill")).not.toBe("#111111");

    restoreText(svg);
    expect(text.style.getPropertyValue("fill")).toBe("#111111");
    expect(text.style.getPropertyPriority("fill")).toBe("important");
    expect(text.hasAttribute("data-dv-text-orig")).toBe(false);
    expect(text.hasAttribute("data-dv-text-prio")).toBe(false);
  });

  test("restore removes the inline colour when there was none", () => {
    const text = place(add("text", { fill: "#333333" }, svg), 10, 10, 60, 12);

    applyReadableText(svg, DARK);
    restoreText(svg);

    expect(text.style.getPropertyValue("fill")).toBe("");
    expect(text.getAttribute("fill")).toBe("#333333");
  });

  test("applying twice starts from the original colours", () => {
    const text = place(add("text", { fill: "#333333" }, svg), 10, 10, 60, 12);

    applyReadableText(svg, DARK);
    const first = text.style.getPropertyValue("fill");
    expect(applyReadableText(svg, DARK)).toBe(1);

    expect(text.style.getPropertyValue("fill")).toBe(first);
    expect(text.getAttribute("data-dv-text-orig")).toBe("");
  });

  test("withOriginalText shows the author's colours only while the callback runs", () => {
    const text = place(add("text", { fill: "#333333" }, svg), 10, 10, 60, 12);
    applyReadableText(svg, DARK);
    const readable = text.style.getPropertyValue("fill");

    const seen = withOriginalText(svg, () => text.style.getPropertyValue("fill"));

    expect(seen).toBe("");
    expect(text.style.getPropertyValue("fill")).toBe(readable);
    expect(text.style.getPropertyPriority("fill")).toBe("important");
    expect(text.getAttribute("data-dv-text-orig")).toBe("");
  });
});

describe("Readable text: modal wiring", () => {
  let viewportText, iconText;

  // A modal with a topbar icon ahead of the diagram in document order
  function buildModal() {
    document.body.innerHTML = "";
    const modal = document.createElement("div");
    modal.id = "diagview-modal";
    const icon = add("svg", {}, modal);
    iconText = place(add("text", { fill: "#333333" }, icon), 0, 0, 20, 10);
    const viewport = document.createElement("div");
    viewport.id = "diagview-modal-viewport";
    modal.appendChild(viewport);
    const diagram = place(add("svg", {}, viewport), 0, 0, 1000, 1000);
    viewportText = place(add("text", { fill: "#333333" }, diagram), 100, 100, 60, 12);
    document.body.appendChild(modal);
    return diagram;
  }

  test("setCanvasTheme recolours the diagram in the viewport when readable text is on", async () => {
    buildModal();
    state.readableText = true;

    theme.setCanvasTheme("dark");
    await flush();

    expect(viewportText.style.getPropertyValue("fill")).not.toBe("");
    expect(iconText.style.getPropertyValue("fill")).toBe("");

    // Back on a light canvas the dark text reads well again
    theme.setCanvasTheme("light");
    await flush();
    expect(viewportText.style.getPropertyValue("fill")).toBe("");
  });

  test("in Auto mode the recolour follows the page when it turns dark and back", async () => {
    buildModal();
    state.readableText = true;
    theme.setCanvasTheme("auto");
    await flush();
    expect(viewportText.style.getPropertyValue("fill")).toBe("");

    const hadMatchMedia = "matchMedia" in window;
    window.matchMedia ??= () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    theme.setupThemeWatchers();
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await flush();
    };
    try {
      document.documentElement.classList.add("dark");
      await settle();
      expect(viewportText.style.getPropertyValue("fill")).not.toBe("");

      document.documentElement.classList.remove("dark");
      await settle();
      expect(viewportText.style.getPropertyValue("fill")).toBe("");
    } finally {
      theme.teardownThemeWatchers();
      document.documentElement.classList.remove("dark");
      if (!hadMatchMedia) delete window.matchMedia;
    }
  });

  test("setCanvasTheme leaves the diagram alone when readable text is off", async () => {
    buildModal();

    theme.setCanvasTheme("dark");
    await flush();

    expect(viewportText.style.getPropertyValue("fill")).toBe("");
    expect(viewportText.hasAttribute("data-dv-text-orig")).toBe(false);
  });

  test("configure() with a new backgroundColor recolours for that canvas", async () => {
    const hadMatchMedia = "matchMedia" in window;
    window.matchMedia ??= () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    try {
      await init({ backgroundColor: LIGHT });
      buildModal();
      theme.setCanvasTheme("auto");
      state.readableText = true;

      configure({ backgroundColor: DARK });
      await flush();
      expect(viewportText.style.getPropertyValue("fill")).not.toBe("");

      configure({ backgroundColor: LIGHT });
      await flush();
      expect(viewportText.style.getPropertyValue("fill")).toBe("");
    } finally {
      await destroy();
      if (!hadMatchMedia) delete window.matchMedia;
    }
  });

  test("a transparent canvas is measured against the page under it", async () => {
    const diagram = buildModal();
    // "transparent" itself needs a browser to parse, this is the same colour
    updateConfig({ backgroundColor: "rgba(0, 0, 0, 0)" });
    createFloatingMenu(document.createElement("div"), diagram);
    try {
      // Dark page: #333 labels are hard to read and change
      document.body.style.backgroundColor = DARK;
      theme.clearThemeCache();
      document.querySelector('[data-text-mode="readable"]').click();
      await flush();
      const fill = viewportText.style.getPropertyValue("fill");
      expect(fill).not.toBe("");
      expect(theme.getContrastRatio(fill, DARK)).toBeGreaterThanOrEqual(4.5);

      // White page: the same labels already read well
      document.body.style.backgroundColor = LIGHT;
      theme.clearThemeCache();
      expect(syncReadableText()).toBe(0);
      expect(viewportText.style.getPropertyValue("fill")).toBe("");
    } finally {
      document.body.style.backgroundColor = "";
    }
  });

  test("with a transparent canvas the recolour follows the page colour", async () => {
    buildModal();
    updateConfig({ backgroundColor: "rgba(0, 0, 0, 0)" });
    state.readableText = true;
    const hadMatchMedia = "matchMedia" in window;
    window.matchMedia ??= () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    theme.setupThemeWatchers();
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await flush();
    };
    try {
      document.body.style.backgroundColor = LIGHT;
      await settle();
      expect(viewportText.style.getPropertyValue("fill")).toBe("");

      document.body.style.backgroundColor = DARK;
      await settle();
      expect(viewportText.style.getPropertyValue("fill")).not.toBe("");
    } finally {
      theme.teardownThemeWatchers();
      document.body.style.backgroundColor = "";
      if (!hadMatchMedia) delete window.matchMedia;
    }
  });

  test("syncReadableText follows the state", () => {
    buildModal();
    theme.setCanvasTheme("dark");

    state.readableText = true;
    expect(syncReadableText()).toBe(1);
    state.readableText = false;
    expect(syncReadableText()).toBe(0);
    expect(viewportText.style.getPropertyValue("fill")).toBe("");
  });

  test("menu starts on Original and the buttons switch the diagram", async () => {
    const diagram = buildModal();
    theme.setCanvasTheme("dark");
    createFloatingMenu(document.createElement("div"), diagram);

    const original = document.querySelector('[data-text-mode="original"]');
    const readable = document.querySelector('[data-text-mode="readable"]');
    expect(original.classList.contains("active")).toBe(true);
    expect(original.getAttribute("aria-pressed")).toBe("true");
    expect(readable.getAttribute("aria-pressed")).toBe("false");

    readable.click();
    await flush();
    expect(state.readableText).toBe(true);
    expect(readable.classList.contains("active")).toBe(true);
    expect(readable.getAttribute("aria-pressed")).toBe("true");
    expect(original.getAttribute("aria-pressed")).toBe("false");
    expect(viewportText.style.getPropertyValue("fill")).not.toBe("");

    original.click();
    await flush();
    expect(state.readableText).toBe(false);
    expect(original.classList.contains("active")).toBe(true);
    expect(viewportText.style.getPropertyValue("fill")).toBe("");
  });

  test("menu opens on Readable when it is already on", () => {
    const diagram = buildModal();
    state.readableText = true;
    createFloatingMenu(document.createElement("div"), diagram);

    const readable = document.querySelector('[data-text-mode="readable"]');
    expect(readable.classList.contains("active")).toBe(true);
    expect(readable.getAttribute("aria-pressed")).toBe("true");
  });

  test("resetConfig turns readable text off", () => {
    state.readableText = true;
    resetConfig();
    expect(state.readableText).toBe(false);
  });
});
