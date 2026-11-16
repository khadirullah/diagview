import { jest } from "@jest/globals";
import {
  cloneSVG,
  cloneSVGForExportAsync,
  cloneSVGForModal,
  resolveElementSecurity,
} from "../src/core/svg-clone.js";
import { state, resetConfig, updateConfig } from "../src/core/config.js";
import { sanitizeSVG } from "../src/core/utils.js";

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

  describe("an export from the fullscreen viewer", () => {
    let viewerSvg;

    beforeEach(() => {
      const modal = document.createElement("div");
      modal.id = "diagview-modal";
      viewerSvg = cloneSVGForModal(dirty);
      modal.appendChild(viewerSvg);
      document.body.appendChild(modal);
      state.activeSourceElement = dirty.parentElement;
    });

    afterEach(() => {
      state.activeSourceElement = null;
    });

    test("uses the open diagram's own mode", async () => {
      const exported = await cloneSVGForExportAsync(viewerSvg);
      expect(exported.querySelector("animate")).not.toBeNull();
      expect(hasRemoteImport(exported)).toBe(true);
    });

    test("still follows allowOverrides: false", async () => {
      updateConfig({ security: { allowOverrides: false } });
      const exported = await cloneSVGForExportAsync(viewerSvg);
      expect(exported.querySelector("animate")).toBeNull();
    });

    test("an SVG outside the viewer does not take the open diagram's mode", async () => {
      const stray = viewerSvg.cloneNode(true);
      document.body.appendChild(stray);
      const exported = await cloneSVGForExportAsync(stray);
      expect(exported.querySelector("animate")).toBeNull();
    });
  });
});

describe("security attributes on a diagram inside a wrapper", () => {
  // .diagram[data-diagview-init] > .mermaid > svg. Init sets up the outer
  // .diagram, as it holds one diagram, and the viewer opens that element.
  const ns = "http://www.w3.org/2000/svg";
  let outer, inner, svg;

  beforeEach(() => {
    updateConfig({ diagramSelector: ".mermaid, .diagram" });
    outer = document.createElement("div");
    outer.className = "diagram";
    outer.dataset.diagviewInit = "1";
    inner = document.createElement("div");
    inner.className = "mermaid";
    svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    const style = document.createElementNS(ns, "style");
    style.textContent = "@import url(https://fonts.googleapis.com/css?family=Inter);";
    svg.appendChild(style);
    const animate = document.createElementNS(ns, "animate");
    animate.setAttribute("attributeName", "x");
    animate.setAttribute("values", "0;1");
    svg.appendChild(animate);
    inner.appendChild(svg);
    outer.appendChild(inner);
    document.body.appendChild(outer);
  });

  afterEach(() => {
    state.activeSourceElement = null;
    resetConfig();
    document.body.innerHTML = "";
  });

  const hasRemoteImport = (clone) =>
    Array.from(clone.querySelectorAll("style")).some((s) => s.textContent.includes("@import"));
  const kept = (clone) => ({
    animate: clone.querySelector("animate") !== null,
    remote: hasRemoteImport(clone),
  });

  // The viewer copy, an export of the page SVG and an export of the viewer copy
  const paths = {
    "the viewer copy": () => {
      state.activeSourceElement = outer;
      return cloneSVGForModal(svg);
    },
    "an export": () => cloneSVGForExportAsync(svg),
    "an export from the viewer": () => {
      state.activeSourceElement = outer;
      const modal = document.createElement("div");
      modal.id = "diagview-modal";
      modal.appendChild(cloneSVGForModal(svg));
      document.body.appendChild(modal);
      return cloneSVGForExportAsync(modal.firstChild);
    },
  };

  const cases = [
    ["the outer element alone", { sanitize: "permissive", remote: "true" }, {}, true, true],
    ["the inner element alone", {}, { sanitize: "permissive", remote: "true" }, true, true],
    [
      "both, where the outer element wins",
      { sanitize: "strict", remote: "false" },
      { sanitize: "permissive", remote: "true" },
      false,
      false,
    ],
    [
      "both the other way round",
      { sanitize: "permissive", remote: "true" },
      { sanitize: "strict", remote: "false" },
      true,
      true,
    ],
    [
      "sanitize on the outer, allow-remote on the inner",
      { sanitize: "permissive" },
      { remote: "true" },
      true,
      true,
    ],
    [
      "allow-remote on the outer, sanitize on the inner",
      { remote: "true" },
      { sanitize: "permissive" },
      true,
      true,
    ],
  ];

  const set = (el, { sanitize, remote }) => {
    if (sanitize) el.dataset.diagviewSanitize = sanitize;
    if (remote) el.dataset.diagviewAllowRemote = remote;
  };

  for (const [path, run] of Object.entries(paths)) {
    test.each(cases)(`${path} reads %s`, async (_name, onOuter, onInner, animate, remote) => {
      set(outer, onOuter);
      set(inner, onInner);
      expect(kept(await run())).toEqual({ animate, remote });
    });
  }

  test("a wrapper around two diagrams leaves each inner diagram its own settings", async () => {
    // Init sets up each .mermaid here, and the wrapper gets no toolbar
    delete outer.dataset.diagviewInit;
    inner.dataset.diagviewInit = "1";
    const second = inner.cloneNode(true);
    outer.appendChild(second);
    outer.dataset.diagviewSanitize = "permissive";
    second.dataset.diagviewSanitize = "permissive";

    expect(kept(await cloneSVGForExportAsync(svg)).animate).toBe(false);
    expect(kept(await cloneSVGForExportAsync(second.querySelector("svg"))).animate).toBe(true);
  });

  test("allowOverrides false ignores the attributes on both elements", async () => {
    updateConfig({ security: { allowOverrides: false } });
    set(outer, { sanitize: "permissive" });
    set(inner, { remote: "true" });
    expect(kept(cloneSVGForModal(svg))).toEqual({ animate: false, remote: false });
    expect(kept(await cloneSVGForExportAsync(svg))).toEqual({ animate: false, remote: false });
  });

  test("an empty attribute on the outer element leaves the inner one in charge", () => {
    outer.dataset.diagviewSanitize = "";
    inner.dataset.diagviewSanitize = "permissive";
    expect(resolveElementSecurity([outer, inner]).mode).toBe("permissive");
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

  test("cloneSVGForExportAsync keeps a zero that differs from the initial value", async () => {
    window.getComputedStyle = jest.fn().mockReturnValue({
      getPropertyValue: (prop) =>
        ({ "stroke-width": "0px", "font-size": "0px", "word-spacing": "0px" })[prop] || "",
    });
    const clonedRect = (await cloneSVGForExportAsync(svg)).querySelector(".test-rect");

    // stroke-width is 1px and font-size medium by default, so 0 hides them
    expect(clonedRect.style.getPropertyValue("stroke-width")).toBe("0px");
    expect(clonedRect.style.getPropertyValue("font-size")).toBe("0px");
    // word-spacing is 0 by default, so writing it changes nothing
    expect(clonedRect.style.getPropertyValue("word-spacing")).toBe("");
  });

  test("cloneSVGForExportAsync copies display, background, decoration and line height", async () => {
    const computed = {
      rect: {
        display: "none",
        "background-color": "rgb(255, 255, 0)",
        "text-decoration": "underline solid rgb(0, 0, 0)",
        "line-height": "24px",
      },
      // The initial values, as a browser reports them
      text: {
        display: "inline",
        "background-color": "rgba(0, 0, 0, 0)",
        "text-decoration": "none solid rgb(0, 0, 0)",
        "line-height": "normal",
      },
    };
    window.getComputedStyle = jest.fn((el) => ({
      getPropertyValue: (prop) => computed[el.tagName]?.[prop] || "",
    }));
    const clone = await cloneSVGForExportAsync(svg);

    const rect = clone.querySelector(".test-rect").style;
    expect(rect.getPropertyValue("display")).toBe("none");
    expect(rect.getPropertyValue("background-color")).toBe("rgb(255, 255, 0)");
    expect(rect.getPropertyValue("text-decoration")).toMatch(/^underline/);
    expect(rect.getPropertyValue("line-height")).toBe("24px");
    // Initial values stay out, so the file does not grow
    expect(clone.querySelector("text").style.cssText).not.toMatch(
      /display|background|decoration|line-height/,
    );
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

  test("the copy keeps every text attribute and <style> text, with labels on one line", () => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <style>.a { fill: red; } #t:hover { fill: blue; }</style>
      <animate attributeName="x" />
      <text id="t" class="a" x="1" y="2" dx="3" dy="4" textLength="50" lengthAdjust="spacing"
        text-anchor="middle" dominant-baseline="central" rotate="5" transform="translate(1 2)"
        >Label<tspan x="1" dy="1.2em">Second</tspan></text>
    </svg>`;
    const svg = document.querySelector("svg");
    const attrs = (el) => [...el.attributes].map((a) => [a.name, a.value]);

    const clone = cloneSVG(svg, { securityMode: "strict", skipIdFix: true });

    expect(clone.querySelector("animate")).toBeNull();
    expect(clone.querySelector("style").textContent).toBe(svg.querySelector("style").textContent);
    ["text", "tspan"].forEach((tag) => {
      const copy = clone.querySelector(tag);
      expect(attrs(copy).filter(([name]) => name !== "style")).toEqual(
        attrs(svg.querySelector(tag)),
      );
      expect(copy.style.whiteSpace).toBe("nowrap");
      expect(copy.style.overflow).toBe("visible");
    });
  });

  test("style content removed by the sanitizer stays out of the copy", () => {
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

  test("an unknown data-diagview-sanitize value warns once per value and names the mode used", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    updateConfig({ security: { mode: "permissive" } });
    container.dataset.diagviewSanitize = "premissive";
    expect(resolveElementSecurity(container, { warn: true }).mode).toBe("permissive");
    resolveElementSecurity(container, { warn: true });
    container.dataset.diagviewSanitize = "none";
    resolveElementSecurity(container, { warn: true });
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      'DiagView: Unknown data-diagview-sanitize "premissive", using "permissive"',
      'DiagView: Unknown data-diagview-sanitize "none", using "permissive"',
    ]);
    warn.mockRestore();
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

describe("cloneSVG copies outside the page", () => {
  let svg;

  beforeEach(() => {
    const container = document.createElement("div");
    container.className = "diagram";
    container.innerHTML =
      '<svg viewBox="0 0 10 10"><image href="missing.png" onerror="window.runs++"/>' +
      '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">Label</div></foreignObject>' +
      '<text x="1" y="5">A</text></svg>';
    document.body.appendChild(container);
    svg = container.querySelector("svg");
  });

  afterEach(() => {
    resetConfig();
    document.body.innerHTML = "";
  });

  test("the copy the sanitizer receives is not owned by the page", () => {
    // "off" hands back the copy it was given, so its owner shows where cloneSVG made it
    const off = cloneSVG(svg, { securityMode: "off" });
    expect(off.ownerDocument).not.toBe(document);
    expect(off.querySelector("image").getAttribute("onerror")).toBe("window.runs++");
  });

  test("strict and permissive copies drop the handler and still work in the page", () => {
    for (const mode of ["strict", "permissive"]) {
      const clone = cloneSVG(svg, { securityMode: mode });
      expect(clone.ownerDocument).not.toBe(document);
      expect(clone).toBeInstanceOf(SVGElement);
      expect(clone.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
      expect(clone.querySelector("image").hasAttribute("onerror")).toBe(false);
      expect(clone.querySelector("foreignObject div").namespaceURI).toBe(
        "http://www.w3.org/1999/xhtml",
      );
      document.body.appendChild(clone);
      expect(clone.ownerDocument).toBe(document);
      expect(clone.querySelector("text").textContent).toBe("A");
      clone.remove();
    }
  });
});

describe("warning when code is removed from a diagram", () => {
  let warnSpy;

  const diagram = (index, inner) => {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagviewIndex = String(index);
    container.innerHTML = `<svg viewBox="0 0 10 10">${inner}</svg>`;
    document.body.appendChild(container);
    return container.querySelector("svg");
  };
  const codeWarnings = () =>
    warnSpy.mock.calls.map((c) => c[0]).filter((m) => m.includes("Removed code"));

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetConfig();
    document.body.innerHTML = "";
  });

  test("warns once with the counts and mode, passing the diagram element", () => {
    const svg = diagram(
      2,
      '<script>alert(1)</script><image href="x.png" onerror="a()"/>' +
        '<rect onclick="b()" onmouseover="c()"/><rect onclick="d()"/>' +
        '<a href="javascript:e()"><text>link</text></a>',
    );
    cloneSVG(svg, { securityMode: "strict" });
    expect(codeWarnings()).toEqual([
      'DiagView: Removed code from this diagram in strict mode: 1 script, 4 event handlers (onerror, onclick, onmouseover), 1 javascript: link. Use security.mode "off" only for diagrams you trust.',
    ]);
    expect(warnSpy.mock.calls.find((c) => c[0].includes("Removed code"))[1]).toBe(
      svg.parentElement,
    );
  });

  test("warns only once for the same diagram", () => {
    const svg = diagram(0, '<image href="x.png" onerror="a()"/>');
    cloneSVGForModal(svg);
    cloneSVG(svg, { securityMode: "permissive" });
    expect(codeWarnings()).toEqual([
      'DiagView: Removed code from this diagram in strict mode: 1 event handler (onerror). Use security.mode "off" only for diagrams you trust.',
    ]);
  });

  test("counts code written by an animation", () => {
    const svg = diagram(
      3,
      '<a><animate attributeName="href" values="javascript:a()"/><text>x</text></a>' +
        '<rect><set attributeName="onclick" to="b()"/></rect>',
    );
    cloneSVG(svg, { securityMode: "permissive" });
    expect(codeWarnings()).toEqual([
      'DiagView: Removed code from this diagram in permissive mode: 1 event handler (onclick), 1 javascript: link. Use security.mode "off" only for diagrams you trust.',
    ]);
  });

  test("stays quiet for a clean Mermaid-like diagram", () => {
    const svg = diagram(
      1,
      '<style>#m .node rect { fill: #ececff; }</style><g class="node"><rect/>' +
        '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">' +
        '<span class="nodeLabel">A</span></div></foreignObject></g><a href="#top"><text>t</text></a>',
    );
    cloneSVG(svg, { securityMode: "strict" });
    expect(codeWarnings()).toEqual([]);
  });

  test("stays quiet when strict removes only animations, CSS and remote resources", () => {
    const svg = diagram(
      4,
      "<style>@import url(https://example.com/a.css);</style>" +
        '<rect><animateTransform attributeName="transform" type="rotate" values="0;360"/></rect>' +
        '<use href="https://example.com/a.svg#x"/>',
    );
    const clone = cloneSVG(svg, { securityMode: "strict" });
    expect(clone.querySelector("animateTransform")).toBeNull();
    expect(codeWarnings()).toEqual([]);
  });

  describe('security.exportMode "strict"', () => {
    const offDiagram = () => {
      const svg = diagram(6, '<rect onclick="b()"/><animate attributeName="x" values="0;1"/>');
      svg.parentElement.dataset.diagviewSanitize = "off";
      return svg;
    };

    beforeEach(() => updateConfig({ security: { exportMode: "strict" } }));

    test("cleans exports in strict mode without a warning", async () => {
      const svg = offDiagram();
      const exported = await cloneSVGForExportAsync(svg);
      expect(exported.querySelector("[onclick]")).toBeNull();
      expect(exported.querySelector("animate")).toBeNull();
      expect(codeWarnings()).toEqual([]);
    });

    test("leaves the fullscreen view in the diagram's own mode", () => {
      const modal = cloneSVGForModal(offDiagram());
      expect(modal.querySelector("[onclick]")).not.toBeNull();
    });

    test("still warns once for a diagram that is strict anyway", async () => {
      const svg = diagram(7, '<rect onclick="b()"/>');
      await cloneSVGForExportAsync(svg);
      await cloneSVGForExportAsync(svg);
      expect(codeWarnings()).toHaveLength(1);
    });

    test('"same" exports in the diagram\'s own mode', async () => {
      updateConfig({ security: { exportMode: "same" } });
      const exported = await cloneSVGForExportAsync(offDiagram());
      expect(exported.querySelector("[onclick]")).not.toBeNull();
    });
  });

  test('never warns in "off" mode', () => {
    const svg = diagram(5, '<script>alert(1)</script><rect onclick="b()"/>');
    cloneSVG(svg, { securityMode: "off" });
    expect(codeWarnings()).toEqual([]);
  });
});

describe("cloneSVGForExportAsync in a tab in the background", () => {
  const ns = "http://www.w3.org/2000/svg";
  let svg;

  /** An SVG with more shapes than one write chunk takes */
  beforeEach(() => {
    svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    for (let i = 0; i < 1200; i++) {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("style", "fill: red");
      svg.appendChild(rect);
    }
    document.body.appendChild(svg);
  });

  afterEach(() => {
    svg.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("finishes when no animation frame ever runs", async () => {
    // A hidden tab runs no frames
    jest.useFakeTimers();
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const done = cloneSVGForExportAsync(svg);
    let clone = null;
    done.then((c) => (clone = c));
    await jest.advanceTimersByTimeAsync(99);
    expect(clone).toBe(null);
    // Three chunks of 500, one timer each
    await jest.advanceTimersByTimeAsync(201);
    expect(clone.querySelectorAll("rect")).toHaveLength(1200);
    expect(clone.querySelector("[data-dv-match-id]")).toBeNull();
    expect(clone.querySelector("rect").style.fill).toBe("rgb(255, 0, 0)");
  });

  test("a frame that runs first cancels the timer, so each chunk runs once", async () => {
    const frames = [];
    jest.useFakeTimers();
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => frames.push(fn));
    const done = cloneSVGForExportAsync(svg);
    while (frames.length) frames.shift()();
    const clone = await done;
    expect(jest.getTimerCount()).toBe(0);
    expect(clone.querySelectorAll("rect")).toHaveLength(1200);
  });
});

describe("cloneSVG copies the SVG once", () => {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <style>.a { fill: red; }</style><script>alert(1)</script>
    <a href="javascript:alert(1)"><rect class="a" onclick="alert(1)" width="5" height="5"/></a>
    <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">Label</div></foreignObject>
    <image href="https://example.com/a.png"/><text x="1">Text</text></svg>`;

  test.each(["strict", "permissive", "off"])(
    "in %s mode the copy matches what sanitizeSVG() returns",
    (mode) => {
      document.body.innerHTML = markup;
      const svg = document.querySelector("svg");
      const expected = sanitizeSVG(svg, mode, { allowRemoteResources: false });
      const importNode = jest.spyOn(Document.prototype, "importNode");
      try {
        const clone = cloneSVG(svg, {
          preserveText: false,
          securityMode: mode,
          skipIdFix: true,
          warnRemoved: false,
          allowRemoteResources: false,
        });
        expect(importNode).toHaveBeenCalledTimes(1);
        const tidy = (el) => el.outerHTML.replace(/ xmlns:xlink="[^"]*"/, "");
        expect(tidy(clone)).toBe(tidy(expected));
      } finally {
        importNode.mockRestore();
      }
    },
  );
});

describe("export copy that fails", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("leaves no match ids on the page's SVG", async () => {
    document.body.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><g class="node"><rect width="5" height="5"/></g></svg>';
    const svg = document.querySelector("svg");
    const importNode = jest.spyOn(Document.prototype, "importNode").mockImplementation(() => {
      throw new Error("copy failed");
    });
    try {
      await expect(cloneSVGForExportAsync(svg)).rejects.toThrow("copy failed");
    } finally {
      importNode.mockRestore();
    }
    expect(svg.querySelectorAll("[data-dv-match-id]")).toHaveLength(0);
  });
});
