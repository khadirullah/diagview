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
