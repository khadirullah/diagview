import { sanitizeSVG } from "../src/core/utils.js";

/**
 * Second security review: sanitizer bypasses found in the string (DOMParser)
 * path and in permissive mode.
 */
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
