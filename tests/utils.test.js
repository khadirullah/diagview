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
      "marker-end:url(#dv-prefix-arrow); filter: url( '#dv-prefix-blur' )",
    );
  });

  test("fixIds rewrites href on textPath, a and feImage plus aria id lists", () => {
    document.body.innerHTML = `
      <svg id="ref-svg">
        <defs>
          <path id="p1" d="M0 0 L10 10"/>
          <filter id="f1"><feImage href="#p1"/><feImage xlink:href="#p1"/></filter>
        </defs>
        <title id="t1">Title</title>
        <desc id="d1">Desc</desc>
        <text><textPath href="#p1">on path</textPath></text>
        <text><textPath xlink:href="#p1">on path</textPath></text>
        <a href="#p1"><text>link</text></a>
        <a xlink:href="#p1"><text>link</text></a>
        <a href="#nope"><text>unknown</text></a>
        <g aria-labelledby="t1 d1" aria-describedby="d1 missing"></g>
      </svg>
    `;

    const svg = document.getElementById("ref-svg");
    fixIds(svg, "dv-1");

    const textPaths = svg.querySelectorAll("textPath");
    expect(textPaths[0].getAttribute("href")).toBe("#dv-1-p1");
    expect(textPaths[1].getAttribute("xlink:href")).toBe("#dv-1-p1");

    const anchors = svg.querySelectorAll("a");
    expect(anchors[0].getAttribute("href")).toBe("#dv-1-p1");
    expect(anchors[1].getAttribute("xlink:href")).toBe("#dv-1-p1");
    // Ids that are not in the map stay untouched
    expect(anchors[2].getAttribute("href")).toBe("#nope");

    const feImages = svg.querySelectorAll("feImage");
    expect(feImages[0].getAttribute("href")).toBe("#dv-1-p1");
    expect(feImages[1].getAttribute("xlink:href")).toBe("#dv-1-p1");

    const g = svg.querySelector("g");
    expect(g.getAttribute("aria-labelledby")).toBe("dv-1-t1 dv-1-d1");
    expect(g.getAttribute("aria-describedby")).toBe("dv-1-d1 missing");
  });

  test("fixIds records aria id list rewrites for restoration", () => {
    document.body.innerHTML = `
      <svg id="aria-svg">
        <title id="t1">Title</title>
        <g aria-labelledby="t1"></g>
      </svg>
    `;
    const svg = document.getElementById("aria-svg");
    const changes = { elements: new Map(), attributes: [], styles: new Map() };
    fixIds(svg, "dv-2", changes);
    const g = svg.querySelector("g");
    expect(g.getAttribute("aria-labelledby")).toBe("dv-2-t1");
    expect(changes.attributes).toEqual([{ el: g, name: "aria-labelledby", value: "t1" }]);
  });

  test("fixIds rewrites hex-looking ids in <style> selectors and url() refs", () => {
    document.body.innerHTML = `
      <svg id="hex-svg">
        <defs>
          <linearGradient id="fade"><stop offset="0"/></linearGradient>
          <linearGradient id="cafe"><stop offset="0"/></linearGradient>
        </defs>
        <style>#bed{fill:red} .x{fill:url(#fade)} .y{fill:URL( '#cafe' )} .z{fill:#bed;stroke:#fade;color:#1234}</style>
        <rect id="bed"/>
        <rect id="1234"/>
      </svg>
    `;
    const svg = document.getElementById("hex-svg");
    fixIds(svg, "dv-1");
    const css = svg.querySelector("style").textContent;

    // Bare #id selectors whose id is a known element are rewritten
    expect(css).toContain("#dv-1-bed{fill:red}");
    // url(#...) is never a colour, even when it looks like hex
    expect(css).toContain("url(#dv-1-fade)");
    expect(css).toContain("URL( '#dv-1-cafe' )");
    // Property values that look like hex colours stay colours
    expect(css).toContain("fill:#bed;stroke:#fade;color:#1234");
  });

  test("fixIds rewrites ids containing dots and colons in <style> and inline style", () => {
    document.body.innerHTML = `
      <svg id="dot-svg">
        <defs>
          <linearGradient id="my.grad"><stop offset="0"/></linearGradient>
          <linearGradient id="ns:grad"><stop offset="0"/></linearGradient>
        </defs>
        <style>.a{fill:url(#my.grad)} .b{fill:url(#ns:grad)} #my\\.grad{opacity:1} #ns\\:grad{opacity:1}</style>
        <rect style="fill:URL(#my.grad)"/>
        <rect id="node1"/>
        <style>#node1.label{fill:blue} #node1:hover{fill:green}</style>
      </svg>
    `;
    const svg = document.getElementById("dot-svg");
    fixIds(svg, "dv-1");
    const styles = svg.querySelectorAll("style");
    const css = styles[0].textContent;

    expect(css).toContain("url(#dv-1-my.grad)");
    expect(css).toContain("url(#dv-1-ns:grad)");
    // Escaped selectors keep their escaping
    expect(css).toContain("#dv-1-my\\.grad{opacity:1}");
    expect(css).toContain("#dv-1-ns\\:grad{opacity:1}");
    // Inline style attribute with upper-case URL( is rewritten too
    expect(svg.querySelector("rect[style]").getAttribute("style")).toBe("fill:URL(#dv-1-my.grad)");
    // "#id.class" and "#id:pseudo" selectors still rewrite the id part only
    expect(styles[1].textContent).toBe(
      "#dv-1-node1.label{fill:blue} #dv-1-node1:hover{fill:green}",
    );
  });

  test("sanitizeFilename preserves Unicode letters and numbers", () => {
    expect(sanitizeFilename("héllo world")).toBe("héllo_world");
    expect(sanitizeFilename("你好世界")).toBe("你好世界");
    expect(sanitizeFilename("diagram-123")).toBe("diagram-123");
    expect(sanitizeFilename("!!!")).toBe("diagram"); // fallback
  });
});
