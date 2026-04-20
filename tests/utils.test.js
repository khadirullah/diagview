import { isBrowser, fixIds } from "../src/core/utils.js";

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
          <clipPath id="clip.with.regex.chars()"><rect width="10" height="10"/></clipPath>
        </defs>
        <g clip-path="url(#clip1)"></g>
        <g clip-path="url(#clip.with.regex.chars())"></g>
      </svg>
    `;

    const svg = document.getElementById("test-svg");
    const fixedSvg = fixIds(svg, "dv-prefix");
    const newHtml = fixedSvg.innerHTML;

    expect(newHtml).toContain('id="dv-prefix-clip1"');
    expect(newHtml).toContain("url(#dv-prefix-clip1)");

    // Testing regex character escaping
    expect(newHtml).toContain('id="dv-prefix-clip.with.regex.chars()"');
    expect(newHtml).toContain("url(#dv-prefix-clip.with.regex.chars())");
  });
});
