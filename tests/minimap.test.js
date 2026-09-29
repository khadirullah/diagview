/**
 * Minimap Visibility Logic Tests
 * Verifies the coordinate-space fix (getBoundingClientRect vs baseVal)
 * and ensures correct minimap behavior across browser zoom levels.
 */

import { jest } from "@jest/globals";
import { state, resetConfig } from "../src/core/config.js";
import {
  updateMinimap,
  cleanupMinimap,
  withPageVariables,
  withCurrentColor,
  refreshMinimapColour,
} from "../src/features/lazy/minimap.js";

// Helper: create element with mocked getBoundingClientRect
function mockElement(rect, viewBox) {
  const el = document.createElement("div");
  el.getBoundingClientRect = jest.fn(() => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: rect.width,
    bottom: rect.height,
    ...rect,
  }));
  if (viewBox) {
    Object.defineProperty(el, "viewBox", {
      value: { baseVal: viewBox },
      configurable: true,
    });
  }
  el.cloneNode = jest.fn(() => {
    const c = document.createElement("div");
    c.style.cssText = "";
    return c;
  });
  return el;
}

function mockPanzoom(scale = 1, pan = { x: 0, y: 0 }) {
  return {
    getScale: () => scale,
    getPan: () => pan,
    getElement: () => document.createElement("div"),
  };
}

describe("Minimap Visibility Logic", () => {
  let minimap;

  beforeEach(() => {
    resetConfig();
    state.minimapSvg = null;

    minimap = document.createElement("div");
    minimap.id = "diagview-minimap";
    const indicator = document.createElement("div");
    indicator.className = "dv-mm-v";
    minimap.appendChild(indicator);
    document.body.appendChild(minimap);
    minimap.getBoundingClientRect = jest.fn(() => ({
      x: 0,
      y: 0,
      width: 160,
      height: 100,
      top: 0,
      right: 160,
      bottom: 100,
      left: 0,
    }));
  });

  afterEach(() => {
    minimap.remove();
    state.minimapSvg = null;
  });

  test("hidden when diagram fits viewport (scale 1, no browser zoom)", () => {
    // SVG fills viewport at scale 1: both rects are equal
    const clone = mockElement({ width: 1200, height: 700 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 1200, height: 700 });

    updateMinimap(clone, viewport, mockPanzoom(1));

    expect(minimap.classList.contains("show")).toBe(false);
  });

  test("visible when diagram is zoomed past viewport (scale 2)", () => {
    // SVG at scale 2: GBCR returns 2x viewport dimensions (includes CSS transform)
    const clone = mockElement({ width: 2400, height: 1400 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 1200, height: 700 });

    updateMinimap(clone, viewport, mockPanzoom(2));

    expect(minimap.classList.contains("show")).toBe(true);
  });

  test("BUG FIX: hidden at 200% browser zoom with scale 1", () => {
    // At 200% browser zoom, getBoundingClientRect returns halved CSS pixels
    // for BOTH SVG and viewport. They still match because both are in the
    // same coordinate space.
    //
    // OLD BUG: used baseVal (800) vs GBCR (600) → 800*1 > 600*1.1 → true (WRONG)
    // FIX:     uses GBCR for both → 600 > 600*1.05 = 630 → false (CORRECT)
    const clone = mockElement({ width: 600, height: 350 }, { width: 800, height: 600 });
    const viewport = mockElement({ width: 600, height: 350 });

    updateMinimap(clone, viewport, mockPanzoom(1));

    expect(minimap.classList.contains("show")).toBe(false);
  });

  test("handles null arguments without throwing", () => {
    expect(() => updateMinimap(null, null, null)).not.toThrow();
    expect(() => updateMinimap(undefined, undefined, undefined)).not.toThrow();
  });

  test("handles missing minimap DOM element gracefully", () => {
    minimap.remove(); // minimap no longer in DOM
    const clone = mockElement({ width: 2400, height: 1400 });
    const viewport = mockElement({ width: 1200, height: 700 });

    expect(() => updateMinimap(clone, viewport, mockPanzoom(2))).not.toThrow();
  });
});

// ── Geometry harness ────────────────────────────────────────────────────────
// jsdom has no SVG geometry (getScreenCTM / createSVGPoint / viewBox), so the
// pieces the minimap relies on are simulated: affine matrices, SVG points and
// a thumbnail whose screen CTM is derived from its viewBox attribute, its
// rendered box inside the minimap and its CSS rotation — the same mapping a
// browser computes for an <svg> with preserveAspectRatio="xMidYMid meet".
function mat(a, b, c, d, e, f) {
  return {
    a,
    b,
    c,
    d,
    e,
    f,
    multiply(n) {
      return mat(
        a * n.a + c * n.b,
        b * n.a + d * n.b,
        a * n.c + c * n.d,
        b * n.c + d * n.d,
        a * n.e + c * n.f + e,
        b * n.e + d * n.f + f,
      );
    },
    inverse() {
      const det = a * d - b * c;
      return mat(
        d / det,
        -b / det,
        -c / det,
        a / det,
        (c * f - d * e) / det,
        (b * e - a * f) / det,
      );
    },
  };
}
const translate = (x, y) => mat(1, 0, 0, 1, x, y);
const scaleM = (s) => mat(s, 0, 0, s, 0, 0);
const rotateM = (deg) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e12) / 1e12;
  const s = Math.round(Math.sin(r) * 1e12) / 1e12;
  return mat(c, s, -s, c, 0, 0);
};
function svgPoint(x = 0, y = 0) {
  const p = { x, y };
  p.matrixTransform = (m) => svgPoint(m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f);
  return p;
}
const parseViewBox = (el) => {
  const v = (el.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return v.length === 4 ? { x: v[0], y: v[1], width: v[2], height: v[3] } : null;
};
const fitInto = (w, h, boxW, boxH) => {
  const s = Math.min(boxW / w, boxH / h);
  return { width: w * s, height: h * s };
};

/**
 * Screen CTM of the minimap thumbnail as a browser would compute it:
 * its box (explicit style width/height, else fitted into the minimap box)
 * centred in the minimap, rotated about its centre, viewBox fitted "meet".
 */
function thumbnailCTM(svg, minimapRect) {
  const vb = parseViewBox(svg);
  const explicit = parseFloat(svg.style.width) > 0 && parseFloat(svg.style.height) > 0;
  const box = explicit
    ? { width: parseFloat(svg.style.width), height: parseFloat(svg.style.height) }
    : fitInto(vb.width, vb.height, minimapRect.width, minimapRect.height);
  const angle = parseFloat((svg.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [])[1] || 0);
  const s = Math.min(box.width / vb.width, box.height / vb.height);
  const pad = { x: (box.width - vb.width * s) / 2, y: (box.height - vb.height * s) / 2 };
  const cx = minimapRect.left + minimapRect.width / 2;
  const cy = minimapRect.top + minimapRect.height / 2;
  return translate(cx, cy)
    .multiply(rotateM(angle))
    .multiply(translate(-box.width / 2, -box.height / 2))
    .multiply(translate(pad.x, pad.y))
    .multiply(scaleM(s))
    .multiply(translate(-vb.x, -vb.y));
}

function rect(left, top, width, height) {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
}

describe("Minimap geometry (viewBox origin, rotation fit, resize)", () => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const proto = window.SVGSVGElement.prototype;
  let minimap, minimapRect, source, panzoom;

  beforeAll(() => {
    Object.defineProperty(proto, "viewBox", {
      configurable: true,
      get() {
        const vb = parseViewBox(this);
        return vb ? { baseVal: vb } : undefined;
      },
    });
    proto.createSVGPoint = () => svgPoint();
    proto.getScreenCTM = function () {
      if (this === state.minimapSvg) return thumbnailCTM(this, minimapRect);
      return this.__ctm || null;
    };
  });

  afterAll(() => {
    delete proto.viewBox;
    delete proto.createSVGPoint;
    delete proto.getScreenCTM;
  });

  beforeEach(() => {
    resetConfig();
    cleanupMinimap();
    state.rotationAngle = 0;
    state.isModalOpen = true;
    minimapRect = rect(0, 0, 160, 100);

    minimap = document.createElement("div");
    minimap.id = "diagview-minimap";
    const indicator = document.createElement("div");
    indicator.className = "dv-mm-v";
    minimap.appendChild(indicator);
    document.body.appendChild(minimap);
    minimap.getBoundingClientRect = () => minimapRect;

    // Original page SVG the thumbnail is snapshotted from
    source = document.createElement("div");
    const original = document.createElementNS(SVG_NS, "svg");
    original.setAttribute("viewBox", "-50 -10 750 500");
    source.appendChild(original);
    state.activeSourceElement = source;

    panzoom = {
      getScale: () => 2,
      getPan: () => ({ x: 0, y: 0 }),
      pan: jest.fn(),
      reset: jest.fn(),
    };
  });

  afterEach(() => {
    cleanupMinimap();
    minimap.remove();
    state.activeSourceElement = null;
    state.isModalOpen = false;
    state.rotationAngle = 0;
  });

  // Clone at scale 2 whose viewBox origin (-50,-10) sits at screen (100,100);
  // viewport 1000x600 at the page origin.
  function makeScene({
    ctm = mat(2, 0, 0, 2, 200, 120),
    cloneRect = rect(100, 100, 1500, 1000),
  } = {}) {
    const clone = document.createElementNS(SVG_NS, "svg");
    clone.setAttribute("viewBox", "-50 -10 750 500");
    clone.getBoundingClientRect = () => cloneRect;
    clone.__ctm = ctm;
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => rect(0, 0, 1000, 600);
    return { clone, viewport };
  }

  const indicatorBox = () => {
    const s = minimap.querySelector(".dv-mm-v").style;
    return {
      left: parseFloat(s.left),
      top: parseFloat(s.top),
      width: parseFloat(s.width),
      height: parseFloat(s.height),
    };
  };

  test("thumbnail viewBox keeps the source viewBox origin", () => {
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    expect(minimap.classList.contains("show")).toBe(true);
    expect(state.minimapSvg.getAttribute("viewBox")).toBe("-50 -10 750 500");
  });

  test("the snapshot fills the thumbnail viewBox from its origin", () => {
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    const img = state.minimapSvg.querySelector("image");
    expect(img.getAttribute("x")).toBe("-50");
    expect(img.getAttribute("y")).toBe("-10");
    expect(img.getAttribute("width")).toBe("750");
    expect(img.getAttribute("height")).toBe("500");
  });

  // jsdom has no SVG lengths, so give the page SVG the ones a browser would
  const setSize = (svg, w, h, unitType = 1) => {
    svg.removeAttribute("viewBox");
    Object.defineProperty(svg, "width", { value: { baseVal: { value: w, unitType } } });
    Object.defineProperty(svg, "height", { value: { baseVal: { value: h, unitType } } });
  };

  test("an SVG with no viewBox gets a thumbnail box of its own width and height", () => {
    setSize(state.activeSourceElement.querySelector("svg"), 260, 180);
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    expect(state.minimapSvg.getAttribute("viewBox")).toBe("0 0 260 180");
    const img = state.minimapSvg.querySelector("image");
    expect(img.getAttribute("width")).toBe("260");
    expect(img.getAttribute("height")).toBe("180");
  });

  test("a percentage size keeps the viewer's box", () => {
    setSize(state.activeSourceElement.querySelector("svg"), 100, 100, 2);
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    expect(state.minimapSvg.getAttribute("viewBox")).toBe("0 0 750 500");
  });

  test("clicking the thumbnail centre centres diagram point (325, 240)", () => {
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    minimap.dispatchEvent(new MouseEvent("click", { clientX: 80, clientY: 50, bubbles: true }));

    // (325,240) is on screen at (850,600); viewport centre is (500,300);
    // panzoom pans in pre-scale pixels: -(350/2), -(300/2)
    expect(panzoom.pan).toHaveBeenCalledTimes(1);
    const [dx, dy, opts] = panzoom.pan.mock.calls[0];
    expect(dx).toBeCloseTo(-175, 6);
    expect(dy).toBeCloseTo(-150, 6);
    expect(opts).toEqual(expect.objectContaining({ relative: true }));
  });

  test("indicator clamps to the viewBox origin, not to 0", () => {
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    // Visible: x -100..400, y -60..240 → clamped to x -50..400, y -10..240.
    // Thumbnail 150x100 at left 5 (scale 0.2): left 5, top 0, 90x50.
    const box = indicatorBox();
    expect(box.left).toBeCloseTo(5, 6);
    expect(box.top).toBeCloseTo(0, 6);
    expect(box.width).toBeCloseTo(90, 6);
    expect(box.height).toBeCloseTo(50, 6);
  });

  test("indicator offsets by the minimap border", () => {
    Object.defineProperty(minimap, "clientLeft", { configurable: true, value: 1 });
    Object.defineProperty(minimap, "clientTop", { configurable: true, value: 1 });
    const { clone, viewport } = makeScene();
    updateMinimap(clone, viewport, panzoom);

    // Same visible rect as above, shifted back by the 1px border
    const box = indicatorBox();
    expect(box.left).toBeCloseTo(4, 6);
    expect(box.top).toBeCloseTo(-1, 6);
    expect(box.width).toBeCloseTo(90, 6);
    expect(box.height).toBeCloseTo(50, 6);
  });

  test("rotated thumbnail is re-fitted so the indicator stays inside the box", () => {
    state.rotationAngle = 90;
    // Clone at scale 2 rotated 90° about the viewBox centre (325,240): the
    // rotated diagram is 1000x1500 on screen, centred in the 1000x600 viewport.
    const ctm = translate(500, 300)
      .multiply(scaleM(2))
      .multiply(rotateM(90))
      .multiply(translate(-325, -240));
    const { clone, viewport } = makeScene({ ctm, cloneRect: rect(0, -450, 1000, 1500) });
    updateMinimap(clone, viewport, panzoom);

    // The 750x500 thumbnail rotated by 90° must fit the 160x100 box: its
    // unrotated height is limited by the box width and vice versa.
    const thumb = state.minimapSvg.style;
    expect(parseFloat(thumb.width)).toBeLessThanOrEqual(100);
    expect(parseFloat(thumb.height)).toBeLessThanOrEqual(160);

    const box = indicatorBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(-1e-6);
    expect(box.top).toBeGreaterThanOrEqual(-1e-6);
    expect(box.left + box.width).toBeLessThanOrEqual(160 + 1e-6);
    expect(box.top + box.height).toBeLessThanOrEqual(100 + 1e-6);
  });

  test("settle timer hides the minimap once an animated reset lands at 1x", () => {
    jest.useFakeTimers();
    try {
      let cloneRect = rect(100, 100, 1500, 1000);
      const { clone, viewport } = makeScene();
      clone.getBoundingClientRect = () => cloneRect;
      updateMinimap(clone, viewport, panzoom);
      expect(minimap.classList.contains("show")).toBe(true);

      // rotate.js resets panzoom with an animation: at t=0 the clone is still
      // zoomed, once the transition settles the diagram fits the viewport
      cloneRect = rect(0, 0, 1000, 600);
      jest.advanceTimersByTime(400);
      expect(minimap.classList.contains("show")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("window resize re-evaluates the minimap until cleanup", () => {
    jest.useFakeTimers();
    try {
      let cloneRect = rect(100, 100, 1500, 1000);
      const { clone, viewport } = makeScene();
      clone.getBoundingClientRect = () => cloneRect;
      updateMinimap(clone, viewport, panzoom);
      jest.advanceTimersByTime(400);
      expect(minimap.classList.contains("show")).toBe(true);

      cloneRect = rect(0, 0, 1000, 600);
      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(100);
      expect(minimap.classList.contains("show")).toBe(false);

      cloneRect = rect(100, 100, 1500, 1000);
      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(100);
      expect(minimap.classList.contains("show")).toBe(true);

      cleanupMinimap();
      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(100);
      expect(minimap.classList.contains("show")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Minimap snapshot keeps page CSS variables", () => {
  const originalGetComputedStyle = window.getComputedStyle;
  const pageVars = { "--box": "#dbeafe", "--line": "rgb(37, 99, 235)", "--label": '"a<b&c"' };
  let svg;

  beforeEach(() => {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    window.getComputedStyle = jest.fn(() => ({ getPropertyValue: (n) => pageVars[n] || "" }));
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    svg.remove();
  });

  test("adds the page values of the variables the SVG uses", () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.b{fill:var(--box);stroke:var( --line, red)}</style>' +
      '<rect style="fill: var(--line)"/><path fill="var(--unset, blue)"/></svg>';
    const out = withPageVariables(markup, svg);
    expect(out.startsWith(markup.slice(0, -6))).toBe(true);
    expect(out.endsWith("<style>:root{--box:#dbeafe;--line:rgb(37, 99, 235);}</style></svg>")).toBe(
      true,
    );
    // The result still parses and the variables resolve inside it
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  test("escapes values so the markup stays well formed", () => {
    const out = withPageVariables(
      '<svg xmlns="http://www.w3.org/2000/svg"><text style="content:var(--label)"/></svg>',
      svg,
    );
    expect(out).toContain('--label:"a&lt;b&amp;c";');
    const doc = new DOMParser().parseFromString(out, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  test("leaves SVGs without var() untouched and never reads styles for them", () => {
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#fff"/></svg>';
    expect(withPageVariables(markup, svg)).toBe(markup);
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  test("leaves the markup alone when the page defines none of the variables", () => {
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="var(--nope)"/></svg>';
    expect(withPageVariables(markup, svg)).toBe(markup);
  });

  test("the minimap image uses the resolved snapshot and the live SVG is unchanged", () => {
    resetConfig();
    state.minimapSvg = null;
    const minimap = document.createElement("div");
    minimap.id = "diagview-minimap";
    const indicator = document.createElement("div");
    indicator.className = "dv-mm-v";
    minimap.appendChild(indicator);
    document.body.appendChild(minimap);

    const source = document.createElement("div");
    source.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect style="fill:var(--box)"/></svg>';
    document.body.appendChild(source);
    const live = source.querySelector("svg");
    const before = live.outerHTML;
    state.activeSourceElement = source;

    const rect = { x: 0, y: 0, top: 0, left: 0, width: 400, height: 400, right: 400, bottom: 400 };
    const clone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    clone.getBoundingClientRect = () => ({ ...rect, width: 800, height: 800 });
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => rect;
    minimap.getBoundingClientRect = () => ({ ...rect, width: 160, height: 100 });
    // jsdom has no SVG geometry; the indicator skips positioning without it
    const proto = window.SVGSVGElement.prototype;
    proto.getScreenCTM = () => null;
    try {
      updateMinimap(clone, viewport, mockPanzoom(2));
    } finally {
      delete proto.getScreenCTM;
    }

    const href = decodeURIComponent(state.minimapSvg.querySelector("image").getAttribute("href"));
    expect(href).toContain("<style>:root{--box:#dbeafe;}</style></svg>");
    expect(live.outerHTML).toBe(before);

    cleanupMinimap();
    minimap.remove();
    source.remove();
    state.activeSourceElement = null;
  });
});

describe("Minimap snapshot keeps the currentColor the viewer draws", () => {
  const originalGetComputedStyle = window.getComputedStyle;
  const NS = "http://www.w3.org/2000/svg";
  let host;

  // Build a live SVG and give each element the colour named in data-c,
  // or its parent's colour when it has none (plain inheritance).
  const build = (html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    host.appendChild(div);
    return div.firstElementChild;
  };
  const colourOf = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.dataset?.c) return n.dataset.c;
    return "rgb(0, 0, 0)";
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    window.getComputedStyle = jest.fn((el) => ({ color: colourOf(el) }));
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    host.remove();
  });

  test("leaves SVGs without currentColor untouched and never reads styles for them", () => {
    const source = build(`<svg xmlns="${NS}"><text fill="#123">a</text></svg>`);
    const markup = new XMLSerializer().serializeToString(source);
    expect(withCurrentColor(markup, source, source)).toBe(markup);
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  test("gives the snapshot root the colour of the shown SVG, in any letter case", () => {
    const source = build(
      `<svg xmlns="${NS}" data-c="rgb(1, 1, 1)"><text fill="CURRENTCOLOR">a</text></svg>`,
    );
    const shown = build(`<svg xmlns="${NS}" data-c="rgb(241, 245, 249)"><text>a</text></svg>`);
    const markup = new XMLSerializer().serializeToString(source);
    const out = withCurrentColor(markup, source, shown);
    expect(out).toBe(
      `${markup.slice(0, -6)}<style>:root{color:rgb(241, 245, 249)!important}</style></svg>`,
    );
    expect(
      new DOMParser().parseFromString(out, "image/svg+xml").querySelector("parsererror"),
    ).toBeNull();
  });

  test("adds a rule only where page CSS gives an element its own colour", () => {
    const tree = (rootC, pageC) =>
      `<svg xmlns="${NS}" data-c="${rootC}">` +
      `<g style="color:red" data-c="rgb(255, 0, 0)"><text fill="currentColor">a</text></g>` +
      `<g><g data-c="${pageC}"><rect stroke="currentColor"/></g></g>` +
      `<text fill="currentColor">b</text></svg>`;
    const source = build(tree("rgb(0, 0, 0)", "rgb(0, 0, 0)"));
    const shown = build(tree("rgb(9, 9, 9)", "rgb(0, 200, 0)"));
    const out = withCurrentColor(new XMLSerializer().serializeToString(source), source, shown);
    const css = out.slice(out.indexOf("<style>") + 7, out.indexOf("</style>"));
    // The inline red travels with the markup, so only the page CSS green is added
    expect(css).toBe(
      ":root{color:rgb(9, 9, 9)!important}" +
        ":root>:nth-child(2)>:nth-child(1){color:rgb(0, 200, 0)!important}",
    );
  });

  test("maps a rotated view back to the source layout and skips parts that do not line up", () => {
    const source = build(
      `<svg xmlns="${NS}"><g><rect fill="currentColor"/></g><g><text/><text/></g></svg>`,
    );
    const shown = build(
      `<svg xmlns="${NS}" data-c="rgb(9, 9, 9)"><g class="dv-rot-g">` +
        `<g data-c="rgb(1, 2, 3)"><rect/></g><g data-c="rgb(4, 5, 6)"><text data-c="rgb(7, 7, 7)"/></g>` +
        `</g></svg>`,
    );
    const out = withCurrentColor(new XMLSerializer().serializeToString(source), source, shown);
    expect(out).toContain(":root>:nth-child(1){color:rgb(1, 2, 3)!important}");
    expect(out).toContain(":root>:nth-child(2){color:rgb(4, 5, 6)!important}");
    // The second group has a different child count, so its children are left alone
    expect(out).not.toContain("rgb(7, 7, 7)");
  });

  test("the minimap image carries the viewer colour and the live SVG is unchanged", () => {
    resetConfig();
    state.minimapSvg = null;
    const minimap = document.createElement("div");
    minimap.id = "diagview-minimap";
    const indicator = document.createElement("div");
    indicator.className = "dv-mm-v";
    minimap.appendChild(indicator);
    document.body.appendChild(minimap);

    const source = document.createElement("div");
    source.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="currentColor">a</text></svg>`;
    host.appendChild(source);
    const live = source.querySelector("svg");
    const before = live.outerHTML;
    state.activeSourceElement = source;

    const rect = { x: 0, y: 0, top: 0, left: 0, width: 400, height: 400, right: 400, bottom: 400 };
    const clone = build(`<svg xmlns="${NS}" data-c="rgb(241, 245, 249)"><text>a</text></svg>`);
    clone.getBoundingClientRect = () => ({ ...rect, width: 800, height: 800 });
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => rect;
    minimap.getBoundingClientRect = () => ({ ...rect, width: 160, height: 100 });
    const proto = window.SVGSVGElement.prototype;
    proto.getScreenCTM = () => null;
    try {
      updateMinimap(clone, viewport, mockPanzoom(2));
    } finally {
      delete proto.getScreenCTM;
    }

    const href = decodeURIComponent(state.minimapSvg.querySelector("image").getAttribute("href"));
    expect(href).toContain("<style>:root{color:rgb(241, 245, 249)!important}</style></svg>");
    expect(live.outerHTML).toBe(before);

    cleanupMinimap();
    minimap.remove();
    state.activeSourceElement = null;
  });

  describe("after the viewer text colour changes", () => {
    let minimap, clone, viewport;

    const open = (svg) => {
      resetConfig();
      state.minimapSvg = null;
      minimap = document.createElement("div");
      minimap.id = "diagview-minimap";
      const indicator = document.createElement("div");
      indicator.className = "dv-mm-v";
      minimap.appendChild(indicator);
      document.body.appendChild(minimap);

      const source = document.createElement("div");
      source.innerHTML = svg;
      host.appendChild(source);
      state.activeSourceElement = source;

      const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: 400,
        height: 400,
        right: 400,
        bottom: 400,
      };
      clone = build(`<svg xmlns="${NS}" data-c="rgb(30, 41, 59)"><text>a</text></svg>`);
      clone.getBoundingClientRect = () => ({ ...rect, width: 800, height: 800 });
      viewport = document.createElement("div");
      viewport.getBoundingClientRect = () => rect;
      minimap.getBoundingClientRect = () => ({ ...rect, width: 160, height: 100 });
      const proto = window.SVGSVGElement.prototype;
      proto.getScreenCTM = () => null;
      try {
        updateMinimap(clone, viewport, mockPanzoom(2));
      } finally {
        delete proto.getScreenCTM;
      }
      return state.minimapSvg.querySelector("image");
    };
    const hrefOf = (img) => decodeURIComponent(img.getAttribute("href"));

    afterEach(() => {
      cleanupMinimap();
      minimap.remove();
      state.activeSourceElement = null;
    });

    test("redraws the same image in the new colour", () => {
      const img = open(
        `<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="currentColor">a</text></svg>`,
      );
      const thumb = state.minimapSvg;
      const layout = [thumb.getAttribute("viewBox"), thumb.style.cssText];
      expect(hrefOf(img)).toContain(":root{color:rgb(30, 41, 59)!important}");

      clone.dataset.c = "rgb(241, 245, 249)";
      refreshMinimapColour();

      expect(hrefOf(img)).toContain(":root{color:rgb(241, 245, 249)!important}");
      expect(hrefOf(img)).not.toContain("rgb(30, 41, 59)");
      // Only the image source changes, the thumbnail and its layout stay
      expect(state.minimapSvg).toBe(thumb);
      expect(thumb.querySelector("image")).toBe(img);
      expect([thumb.getAttribute("viewBox"), thumb.style.cssText]).toEqual(layout);
      expect(minimap.querySelector(".dv-mm-v")).not.toBeNull();
    });

    test("leaves the image alone when the colour did not change", () => {
      const img = open(
        `<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="currentColor">a</text></svg>`,
      );
      const setAttribute = jest.spyOn(img, "setAttribute");
      refreshMinimapColour();
      expect(setAttribute).not.toHaveBeenCalled();
    });

    test("never rebuilds a snapshot that does not use currentColor", () => {
      const img = open(`<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="#123">a</text></svg>`);
      const before = img.getAttribute("href");
      const setAttribute = jest.spyOn(img, "setAttribute");
      window.getComputedStyle.mockClear();

      clone.dataset.c = "rgb(241, 245, 249)";
      refreshMinimapColour();

      expect(setAttribute).not.toHaveBeenCalled();
      expect(window.getComputedStyle).not.toHaveBeenCalled();
      expect(img.getAttribute("href")).toBe(before);
    });

    test("waits for colour transitions on the viewer to end before drawing", async () => {
      const img = open(
        `<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="currentColor">a</text></svg>`,
      );
      const modal = document.createElement("div");
      modal.id = "diagview-modal";
      document.body.appendChild(modal);
      let finish;
      let running = [
        { transitionProperty: "color", finished: new Promise((r) => (finish = r)) },
        { transitionProperty: "opacity", finished: new Promise(() => {}) },
      ];
      modal.getAnimations = jest.fn(() => running);
      try {
        clone.dataset.c = "rgb(100, 100, 100)";
        refreshMinimapColour();
        await Promise.resolve();
        expect(hrefOf(img)).toContain("rgb(30, 41, 59)");

        // Settled on the final colour, only the opacity fade is left
        clone.dataset.c = "rgb(241, 245, 249)";
        running = running.slice(1);
        finish();
        await new Promise((r) => setTimeout(r, 0));
        expect(hrefOf(img)).toContain(":root{color:rgb(241, 245, 249)!important}");
      } finally {
        modal.remove();
      }
    });

    test("does nothing once the minimap is cleaned up", () => {
      const img = open(
        `<svg xmlns="${NS}" viewBox="0 0 100 100"><text fill="currentColor">a</text></svg>`,
      );
      cleanupMinimap();
      const setAttribute = jest.spyOn(img, "setAttribute");
      clone.dataset.c = "rgb(241, 245, 249)";
      expect(() => refreshMinimapColour()).not.toThrow();
      expect(setAttribute).not.toHaveBeenCalled();
    });
  });
});
