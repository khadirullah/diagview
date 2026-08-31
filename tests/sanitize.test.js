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
