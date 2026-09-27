import { jest } from "@jest/globals";
import { sanitizeSVG } from "../src/core/utils.js";

/**
 * Sanitizer regression tests.
 *
 * URL-scheme hardening: browsers strip ASCII whitespace/control characters
 * when parsing URLs, so scheme checks must normalize values first.
 *
 * Mermaid fidelity: strict mode must never strip the structures Mermaid
 * output depends on (text labels, foreignObject htmlLabels, style blocks,
 * class-based styling, markers/defs) — "sanitizer broke my diagrams" is the
 * regression these fixtures guard against.
 *
 * Hardening: bypasses in the string (DOMParser) path, permissive mode, CSS
 * escapes, the size guard and prefixed XML names.
 */
describe("sanitizeSVG URL scheme checks", () => {
  const sanitizeToString = (svg, mode = "strict") => {
    const result = sanitizeSVG(svg, mode);
    return typeof result === "string" ? result : result.outerHTML;
  };

  test("blocks plain javascript: URLs", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>`,
    );
    expect(out).not.toContain("javascript:");
  });

  test("blocks javascript: URLs with embedded tab/newline (browser strips them)", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="java\tscript:alert(1)"><text>x</text></a></svg>`,
    );
    expect(out).not.toContain("script:alert");

    const out2 = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#10;script:alert(1)"><text>x</text></a></svg>`,
    );
    expect(out2).not.toContain("script:alert");
  });

  test("blocks javascript: URLs with leading control characters", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>`,
    );
    expect(out).not.toContain("javascript:");
  });

  test("keeps benign hrefs that merely start with 'javascript'", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript-guide.html"><text>docs</text></a></svg>`,
    );
    expect(out).toContain('href="javascript-guide.html"');
  });

  test("keeps normal http and relative links", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com/page"><text>x</text></a><a href="./local.html"><text>y</text></a></svg>`,
    );
    expect(out).toContain('href="https://example.com/page"');
    expect(out).toContain('href="./local.html"');
  });

  test("strict mode blocks protocol-relative external <use> references", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><use href="//evil.example/x.svg#p"/></svg>`,
    );
    expect(out).not.toContain("evil.example");
  });

  test("strict mode keeps internal #fragment <use> references", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="node"/></defs><use href="#node"/></svg>`,
    );
    expect(out).toContain('href="#node"');
  });

  test("allows safe raster data URIs on images", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="${png}"/></svg>`,
    );
    expect(out).toContain(png);
  });

  test("blocks data:image/svg+xml URIs", () => {
    const out = sanitizeToString(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>`,
    );
    expect(out).not.toContain("svg+xml");
  });
});

describe("sanitizeSVG Mermaid fidelity (strict mode)", () => {
  // Trimmed-down shape of real Mermaid flowchart output with htmlLabels.
  const MERMAID_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 200" class="flowchart" id="mermaid-1">
    <style>#mermaid-1 .node rect { fill: #ececff; stroke: #9370db; } #mermaid-1 .edgeLabel { background-color: #e8e8e8; }</style>
    <defs><marker id="arrowhead" refX="9" refY="5" markerWidth="8" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>
    <g class="root">
      <g class="edgePaths"><path d="M50,50L150,50" class="edge" marker-end="url(#arrowhead)"></path></g>
      <g class="nodes">
        <g class="node" id="flowchart-A"><rect width="80" height="40" x="10" y="30"></rect>
          <g class="label"><foreignObject width="60" height="20"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block;"><span class="nodeLabel">Start</span></div></foreignObject></g>
        </g>
        <g class="node" id="flowchart-B"><rect width="80" height="40" x="160" y="30"></rect>
          <g class="label"><text><tspan>Deploy</tspan></text></g>
        </g>
      </g>
    </g>
  </svg>`;

  test("keeps text labels, htmlLabels, style blocks, markers, and classes", () => {
    const result = sanitizeSVG(MERMAID_FIXTURE, "strict");
    const out = typeof result === "string" ? result : result.outerHTML;

    expect(out).toContain("Start"); // foreignObject htmlLabel text
    expect(out).toContain("Deploy"); // plain SVG text label
    expect(out).toContain("<foreignObject"); // htmlLabels container
    expect(out).toContain("nodeLabel"); // class-based styling hooks
    expect(out).toContain(".node rect"); // style block content
    expect(out).toContain("url(#arrowhead)"); // marker reference
    expect(out).toContain('id="arrowhead"'); // marker definition
  });
});

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

const wrap = (inner, extraNs = "") =>
  `<svg xmlns="${SVG_NS}" xmlns:svg="${SVG_NS}" xmlns:xl="${XLINK_NS}" ${extraNs}>${inner}</svg>`;

const sanitizeToString = (svg, mode = "strict", options) => {
  const result = sanitizeSVG(svg, mode, options);
  return typeof result === "string" ? result : result.outerHTML;
};

describe("sanitizeSVG prefixed XML names (strict)", () => {
  test("<svg:script> is removed like <script>", () => {
    const out = sanitizeToString(wrap(`<svg:script>alert(1)</svg:script><text>ok</text>`));
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<text>ok</text>");
  });

  test('<svg:animate attributeName="href"> is removed like <animate>', () => {
    const out = sanitizeToString(
      wrap(`<a href="#x"><svg:animate attributeName="href" values="javascript:alert(1)"/></a>`),
    );
    expect(out).not.toContain("animate");
    expect(out).not.toContain("javascript:");
  });

  test("xl:href bound to the XLink namespace is scheme-checked like xlink:href", () => {
    const out = sanitizeToString(wrap(`<a xl:href="javascript:alert(1)"><text>x</text></a>`));
    expect(out).not.toContain("javascript:");
    expect(out).toContain("<text>x</text>");
  });

  test("external xl:href on <svg:use> is stripped in strict mode", () => {
    const out = sanitizeToString(wrap(`<svg:use xl:href="https://evil.com/x.svg#payload"/>`));
    expect(out).not.toContain("evil.com");
  });

  test("<h:iframe> inside foreignObject is removed like <iframe>", () => {
    const out = sanitizeToString(
      wrap(
        `<foreignObject><h:iframe xmlns:h="${XHTML_NS}" src="https://evil.com/"></h:iframe><h:div xmlns:h="${XHTML_NS}">label</h:div></foreignObject>`,
      ),
    );
    expect(out).not.toContain("iframe");
    expect(out).not.toContain("evil.com");
    expect(out).toContain("label");
  });

  test("<svg:style> with expression() is removed like <style>", () => {
    const out = sanitizeToString(wrap(`<svg:style>.a{width:expression(alert(1))}</svg:style>`));
    expect(out).not.toContain("expression(");
  });

  test("prefixed on* attributes are removed", () => {
    const out = sanitizeToString(wrap(`<rect svg:onclick="alert(1)" width="1"/>`));
    expect(out).not.toContain("alert(1)");
    expect(out).toContain('width="1"');
  });
});

describe("sanitizeSVG CSS escape and syntax variants (strict, remote blocked)", () => {
  // Same CSS in a <style> block and in a style attribute; both must be scrubbed.
  const styleBlock = (css) =>
    wrap(`<style>${css}</style><rect style="${css.replace(/"/g, "&quot;")}"/>`);

  test.each([
    ["backslash-escaped protocol-relative url", ".a{background:url(\\/\\/evil.com/x.png)}"],
    ["single-char escape inside the scheme", "@font-face{src:url(h\\ttps://evil.com/f.woff)}"],
    ["escaped @import keyword", '@\\import "https://evil.com/x.css";'],
    ["@import with no whitespace before the string", '@import"https://evil.com/x.css";'],
    [
      "whitespace after the opening quote in url()",
      ".a{background:url(' https://evil.com/x.png')}",
    ],
  ])("removes remote resource written as %s", (_label, css) => {
    const out = sanitizeToString(styleBlock(css));
    expect(out).toContain("<rect"); // parsed fine, not rejected wholesale
    expect(out).not.toContain("evil.com");
    expect(out).not.toContain("import");
  });

  test("local url(#grad) and raster data: URIs still survive", () => {
    const css = ".a{fill:url(#grad)} .b{background:url(data:image/png;base64,iVBORw0KGgo=)}";
    const out = sanitizeToString(styleBlock(css));
    expect(out).toContain("url(#grad)");
    expect(out).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(out.match(/<style>/g)).toHaveLength(1);
    expect(out).toContain("<rect style=");
  });
});

describe("sanitizeSVG SMIL animation of href/on* attributes (permissive)", () => {
  test('<animate attributeName="href"> is removed in permissive mode', () => {
    const out = sanitizeToString(
      wrap(
        `<a href="#x"><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a>`,
      ),
      "permissive",
    );
    expect(out).not.toContain("<animate");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("<text>x</text>");
  });

  test.each([
    ["xlink:href", `<set attributeName="xlink:href" to="javascript:alert(1)"/>`],
    ["HREF (case-insensitive)", `<animate attributeName="HREF" values="javascript:alert(1)"/>`],
    ["prefixed xl:href", `<animate attributeName="xl:href" values="javascript:alert(1)"/>`],
    ["onclick", `<set attributeName="onclick" to="alert(1)"/>`],
    ["onload via animateTransform", `<animateTransform attributeName="onload" to="alert(1)"/>`],
  ])("animation targeting %s is removed in permissive mode", (_label, el) => {
    const out = sanitizeToString(wrap(`<a href="#x">${el}<text>x</text></a>`), "permissive");
    expect(out).not.toMatch(/<(?:animate|set|animateTransform)\b/);
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<text>x</text>");
  });

  test("animations of other attributes are kept in permissive mode", () => {
    const out = sanitizeToString(
      wrap(
        `<rect width="1"><animate attributeName="x" values="0;1" dur="1s"/><animateTransform attributeName="transform" type="rotate" from="0" to="360"/><set attributeName="fill" to="red"/></rect>`,
      ),
      "permissive",
    );
    expect(out).toContain('<animate attributeName="x"');
    expect(out).toContain('<animateTransform attributeName="transform"');
    expect(out).toContain('<set attributeName="fill"');
  });

  test("strict mode still removes every animation element", () => {
    const out = sanitizeToString(
      wrap(`<rect width="1"><animate attributeName="x" values="0;1"/></rect>`),
      "strict",
    );
    expect(out).not.toContain("<animate");
    expect(out).toContain("<rect");
  });
});

describe("sanitizeSVG <link>, <base>, <meta> inside foreignObject", () => {
  const payload = wrap(
    `<foreignObject><link xmlns="${XHTML_NS}" rel="stylesheet" href="https://evil.com/x.css"/><base xmlns="${XHTML_NS}" href="https://evil.com/"/><meta xmlns="${XHTML_NS}" http-equiv="refresh" content="0;url=https://evil.com"/><div xmlns="${XHTML_NS}">label</div></foreignObject>`,
  );

  test.each(["strict", "permissive"])("none of the three survive in %s mode", (mode) => {
    const out = sanitizeToString(payload, mode);
    expect(out).not.toMatch(/<(?:\w+:)?link\b/);
    expect(out).not.toMatch(/<(?:\w+:)?base\b/);
    expect(out).not.toMatch(/<(?:\w+:)?meta\b/);
    expect(out).not.toContain("evil.com");
    expect(out).toContain("label");
  });

  test("prefixed <h:link> and <h:meta> are removed too", () => {
    const out = sanitizeToString(
      wrap(
        `<foreignObject><h:link xmlns:h="${XHTML_NS}" rel="stylesheet" href="https://evil.com/x.css"/><h:meta xmlns:h="${XHTML_NS}" http-equiv="refresh" content="0;url=https://evil.com"/></foreignObject>`,
      ),
      "permissive",
    );
    expect(out).not.toContain("evil.com");
    expect(out).not.toMatch(/<(?:\w+:)?link\b/);
    expect(out).not.toMatch(/<(?:\w+:)?meta\b/);
  });

  test("Node input path removes them as well", () => {
    const doc = new DOMParser().parseFromString(payload, "image/svg+xml");
    const result = sanitizeSVG(doc.documentElement, "strict");
    expect(result.querySelectorAll("link, base, meta")).toHaveLength(0);
    expect(result.outerHTML).not.toContain("evil.com");
    // Original node untouched
    expect(doc.documentElement.querySelectorAll("link, base, meta")).toHaveLength(3);
  });
});

describe("sanitizeSVG size guard and options handling", () => {
  const big = wrap(`<rect width="1"/>`.repeat(20));
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  test("string input above maxChars is rejected", () => {
    expect(sanitizeSVG(big, "strict", { maxChars: 50 })).toBe("");
    expect(errorSpy).toHaveBeenCalled();
  });

  test("Node input above maxChars is rejected the same way (options object)", () => {
    const node = new DOMParser().parseFromString(big, "image/svg+xml").documentElement;
    const result = sanitizeSVG(node, "strict", { maxChars: 50 });
    expect(result).toBeFalsy();
    expect(errorSpy).toHaveBeenCalled();
    // Original node untouched
    expect(node.querySelectorAll("rect")).toHaveLength(20);
  });

  test("Node input above maxChars is rejected the same way (numeric shorthand)", () => {
    const node = new DOMParser().parseFromString(big, "image/svg+xml").documentElement;
    expect(sanitizeSVG(node, "strict", 50)).toBeFalsy();
  });

  test("Node input below maxChars is sanitized normally", () => {
    const node = new DOMParser().parseFromString(big, "image/svg+xml").documentElement;
    const result = sanitizeSVG(node, "strict", { maxChars: big.length + 100 });
    expect(result).toBeInstanceOf(Node);
    expect(result.querySelectorAll("rect")).toHaveLength(20);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("maxChars of 0 or unset never blocks Node input", () => {
    const node = new DOMParser().parseFromString(big, "image/svg+xml").documentElement;
    expect(sanitizeSVG(node, "strict", { maxChars: 0 })).toBeInstanceOf(Node);
    expect(sanitizeSVG(node, "strict")).toBeInstanceOf(Node);
  });

  test("options=null behaves like no options for string and Node input", () => {
    const node = new DOMParser().parseFromString(big, "image/svg+xml").documentElement;
    expect(() => sanitizeSVG(big, "strict", null)).not.toThrow();
    expect(sanitizeSVG(big, "strict", null)).toBe(sanitizeSVG(big, "strict"));
    expect(() => sanitizeSVG(node, "strict", null)).not.toThrow();
    expect(sanitizeSVG(node, "strict", null).querySelectorAll("rect")).toHaveLength(20);
  });

  test("options=null still lets raster data: URIs through (allowedImageTypes default)", () => {
    const svg = wrap(`<image href="data:image/png;base64,iVBORw0KGgo="/>`);
    expect(() => sanitizeSVG(svg, "strict", null)).not.toThrow();
    expect(sanitizeSVG(svg, "strict", null)).toContain("data:image/png");
  });
});

describe("sanitizeSVG Node input", () => {
  test("cleans a copy made outside the page, so images in it never load", () => {
    const host = document.createElement("div");
    host.innerHTML = '<svg><image href="missing.png" onerror="window.runs++"/></svg>';
    const svg = host.firstChild;
    const clean = sanitizeSVG(svg, "strict");
    expect(clean.ownerDocument).not.toBe(document);
    expect(clean.querySelector("image").hasAttribute("onerror")).toBe(false);
    // The original keeps its handler
    expect(svg.querySelector("image").getAttribute("onerror")).toBe("window.runs++");
  });

  test('"off" returns the input itself', () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(sanitizeSVG(svg, "off")).toBe(svg);
  });
});

describe("sanitizeSVG removed option", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>a()</script><rect onclick="b()"/>' +
    '<a href="java&#9;script:c()"><text>x</text></a><animate attributeName="x" values="0;1"/>' +
    '<a href="data:text/html,x"><text>y</text></a></svg>';

  test("counts scripts, handlers and javascript: links, not other removals", () => {
    const removed = { scripts: 0, handlers: [], urls: 0 };
    sanitizeSVG(svg, "strict", { removed });
    expect(removed).toEqual({ scripts: 1, handlers: ["onclick"], urls: 1 });
  });

  test('leaves the counts alone in "off" mode', () => {
    const removed = { scripts: 0, handlers: [], urls: 0 };
    sanitizeSVG(svg, "off", { removed });
    expect(removed).toEqual({ scripts: 0, handlers: [], urls: 0 });
  });
});
