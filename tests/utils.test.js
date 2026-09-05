import { isBrowser, fixIds, sanitizeFilename } from "../src/core/utils.js";

describe("Utils API", () => {
  test("isBrowser accurately detects JS environment", () => {
    // JSDOM provides window and document
    expect(isBrowser()).toBe(true);
  });

  test("fixIds properly namespaces SVG definitions", () => {
    document.body.innerHTML = `
      <svg id="test-svg">
        <defs>
          <clipPath id="clip1"><rect width="10" height="10"/></clipPath>
          <clipPath id="clip.with.regex.chars$"><rect width="10" height="10"/></clipPath>
        </defs>
        <g clip-path="url(#clip1)"></g>
        <g clip-path="url(#clip.with.regex.chars$)"></g>
      </svg>
    `;

    const svg = document.getElementById("test-svg");
    const fixedSvg = fixIds(svg, "dv-prefix");
    const newHtml = fixedSvg.innerHTML;

    expect(newHtml).toContain('id="dv-prefix-clip1"');
    expect(newHtml).toContain("url(#dv-prefix-clip1)");

    // Testing regex character escaping
    expect(newHtml).toContain('id="dv-prefix-clip.with.regex.chars$"');
    expect(newHtml).toContain("url(#dv-prefix-clip.with.regex.chars$)");
  });

  test("fixIds rewrites url(#id) references written in inline style attributes", () => {
    // Inkscape/Illustrator exports (and hand-written SVGs) put paint references
    // in style="", not in fill="" — those elements carry no fill/stroke attribute.
    document.body.innerHTML = `
      <svg id="test-svg">
        <defs>
          <linearGradient id="grad"><stop offset="0"/></linearGradient>
          <marker id="arrow"><path d="M0,0 L10,5 L0,10 z"/></marker>
          <filter id="blur"></filter>
        </defs>
        <rect id="r1" width="10" height="10" style="fill:url(#grad);stroke:url(#grad)"/>
        <path id="p1" d="M0,0 L10,10" style="marker-end:url(#arrow); filter: url( '#blur' )"/>
      </svg>
    `;

    const svg = document.getElementById("test-svg");
    fixIds(svg, "dv-prefix");

    expect(document.getElementById("dv-prefix-r1").getAttribute("style")).toBe(
      "fill:url(#dv-prefix-grad);stroke:url(#dv-prefix-grad)",
    );
    expect(document.getElementById("dv-prefix-p1").getAttribute("style")).toBe(
      "marker-end:url(#dv-prefix-arrow); filter: url(#dv-prefix-blur)",
    );
  });

  test("sanitizeFilename preserves Unicode letters and numbers", () => {
    expect(sanitizeFilename("héllo world")).toBe("héllo_world");
    expect(sanitizeFilename("你好世界")).toBe("你好世界");
    expect(sanitizeFilename("diagram-123")).toBe("diagram-123");
    expect(sanitizeFilename("!!!")).toBe("diagram"); // fallback
  });
});
