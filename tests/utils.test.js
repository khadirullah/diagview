import { jest } from "@jest/globals";
import {
  isBrowser,
  fixIds,
  sanitizeFilename,
  getClientCTM,
  loadScript,
  getDiagramSvg,
  hasDrawnContent,
  getDiagramTitle,
  isClipboardAvailable,
  copyText,
  isMobileDevice,
  watchViewport,
} from "../src/core/utils.js";

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

  test("fixIds rewrites an aria id list", () => {
    document.body.innerHTML = `
      <svg id="aria-svg">
        <title id="t1">Title</title>
        <g aria-labelledby="t1"></g>
      </svg>
    `;
    const svg = document.getElementById("aria-svg");
    fixIds(svg, "dv-2");
    const g = svg.querySelector("g");
    expect(g.getAttribute("aria-labelledby")).toBe("dv-2-t1");
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

// jsdom has no SVG geometry, so a small 2D affine matrix stands in for
// SVGMatrix and the probe's measurements are stubbed on the prototype
class Mat {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    Object.assign(this, { a, b, c, d, e, f });
  }
  multiply(m) {
    return new Mat(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    return new Mat(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    );
  }
}

describe("getClientCTM", () => {
  const proto = window.SVGElement.prototype;
  // The screen CTM and client rect the hidden 100x100 probe reports
  let probeCTM;
  let probeRect;
  let el;

  beforeEach(() => {
    probeCTM = new Mat();
    probeRect = { left: 0, top: 0, width: 100, height: 100 };
    proto.createSVGMatrix = () => new Mat();
    proto.getScreenCTM = function () {
      return this === el ? new Mat(2, 0, 0, 2, 40, 60) : probeCTM;
    };
    proto.getBoundingClientRect = () => probeRect;
    document.body.innerHTML = "<svg><g></g></svg>";
    el = document.querySelector("g");
    // Forget the probe result of the test before
    watchViewport(false);
  });

  afterEach(() => {
    delete proto.createSVGMatrix;
    delete proto.getScreenCTM;
    delete proto.getBoundingClientRect;
  });

  test("returns null without a CTM", () => {
    el.getScreenCTM = () => null;
    expect(getClientCTM(el)).toBeNull();
  });

  test("keeps the CTM when screen and client pixels agree", () => {
    const m = getClientCTM(el);
    expect([m.a, m.d, m.e, m.f]).toEqual([2, 2, 40, 60]);
  });

  test("maps a page-zoomed screen CTM back to client pixels", () => {
    // WebKit at a 0.4 page zoom reports screen pixels as client pixels times 0.4
    probeCTM = new Mat(0.4, 0, 0, 0.4, 0, 0);
    const real = new Mat(2, 0, 0, 2, 40, 60);
    proto.getScreenCTM = function () {
      return this === el ? new Mat(0.4, 0, 0, 0.4, 0, 0).multiply(real) : probeCTM;
    };
    const m = getClientCTM(el);
    expect(m.a).toBeCloseTo(2);
    expect(m.d).toBeCloseTo(2);
    expect(m.e).toBeCloseTo(40);
    expect(m.f).toBeCloseTo(60);
  });

  test("probes again only after the page zoom, size or scroll changed", async () => {
    const probes = jest.spyOn(document.documentElement, "appendChild");
    const vv = { scale: 1, offsetLeft: 0, offsetTop: 0, width: 1024, height: 768 };
    window.visualViewport = vv;
    try {
      getClientCTM(el);
      await Promise.resolve();
      getClientCTM(el);
      expect(probes).toHaveBeenCalledTimes(1);

      vv.scale = 0.5;
      getClientCTM(el);
      expect(probes).toHaveBeenCalledTimes(2);

      // A teardown forgets it
      watchViewport(false);
      getClientCTM(el);
      expect(probes).toHaveBeenCalledTimes(3);
    } finally {
      probes.mockRestore();
      delete window.visualViewport;
    }
  });

  test("removes the probe again", async () => {
    probeCTM = new Mat(0.5, 0, 0, 0.5, 0, 0);
    const before = document.documentElement.childElementCount;
    getClientCTM(el);
    expect(document.documentElement.childElementCount).toBe(before);
  });
});

describe("loadScript", () => {
  afterEach(() => {
    jest.useRealTimers();
    document.head.innerHTML = "";
  });

  test("a download that stalls rejects after 15 seconds", async () => {
    jest.useFakeTimers();
    // jsdom never fetches the script, so neither load nor error fires
    const result = loadScript("https://example.test/stalled.js");
    let settled = false;
    result.catch(() => {}).finally(() => (settled = true));
    jest.advanceTimersByTime(14999);
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(result).rejects.toThrow("Timed out loading script");
  });

  test("a script that loads in time resolves and leaves no timer", async () => {
    jest.useFakeTimers();
    const result = loadScript("https://example.test/quick.js");
    document.head
      .querySelector('script[src="https://example.test/quick.js"]')
      .dispatchEvent(new Event("load"));
    await expect(result).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("loadScript integrity", () => {
  afterEach(() => {
    jest.useRealTimers();
    document.head.innerHTML = "";
  });

  const tagFor = (url) => document.head.querySelector(`script[src="${url}"]`);

  test("an integrity hash goes on the tag with crossOrigin anonymous", async () => {
    jest.useFakeTimers();
    const url = "https://example.test/sri.js";
    const result = loadScript(url, "sha384-abc");
    expect(tagFor(url).integrity).toBe("sha384-abc");
    expect(tagFor(url).crossOrigin).toBe("anonymous");
    tagFor(url).dispatchEvent(new Event("load"));
    await expect(result).resolves.toBeUndefined();
  });

  test("without a hash the tag has no integrity and no crossOrigin", async () => {
    jest.useFakeTimers();
    const url = "https://example.test/no-sri.js";
    const result = loadScript(url);
    expect(tagFor(url).hasAttribute("integrity")).toBe(false);
    expect(tagFor(url).hasAttribute("crossorigin")).toBe(false);
    tagFor(url).dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow(`Failed to load script: ${url}`);
    await expect(result).rejects.not.toThrow("Integrity");
  });

  test("a failed load with a hash names a possible integrity mismatch", async () => {
    jest.useFakeTimers();
    const url = "https://example.test/sri-fails.js";
    const result = loadScript(url, "sha384-abc");
    tagFor(url).dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow("Subresource Integrity (SRI) mismatch");
  });

  test("a failed load removes its tag, so the next call loads the script again", async () => {
    jest.useFakeTimers();
    const url = "https://example.test/retry-after-error.js";
    const first = loadScript(url, "sha384-abc");
    tagFor(url).dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("Failed to load script");
    expect(tagFor(url)).toBeNull();

    const second = loadScript(url, "sha384-abc");
    expect(document.querySelectorAll("script")).toHaveLength(1);
    tagFor(url).dispatchEvent(new Event("load"));
    await expect(second).resolves.toBeUndefined();
  });

  test("a stalled load removes its tag after the time limit", async () => {
    jest.useFakeTimers();
    const url = "https://example.test/retry-after-stall.js";
    const result = loadScript(url);
    jest.advanceTimersByTime(15000);
    await expect(result).rejects.toThrow("Timed out loading script");
    expect(tagFor(url)).toBeNull();
  });
});

describe("loadScript with a <script> the page already has", () => {
  const original = performance.getEntriesByName;
  let url, script;
  let n = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    // loadScript remembers each URL, so every test gets its own
    url = `https://example.test/page-script-${++n}.js`;
    script = document.createElement("script");
    script.src = url;
    document.head.appendChild(script);
  });

  afterEach(() => {
    jest.useRealTimers();
    performance.getEntriesByName = original;
    document.head.innerHTML = "";
  });

  /** Timing entries the browser has for the URL */
  const timing = (entries) => {
    performance.getEntriesByName = jest.fn((name) => (name === url ? entries : []));
  };

  test("one still loading is waited for, and no second tag is added", async () => {
    timing([]);
    let settled = false;
    const result = loadScript(url).finally(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(document.querySelectorAll("script")).toHaveLength(1);
    script.dispatchEvent(new Event("load"));
    await expect(result).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("one still loading that fails rejects", async () => {
    timing([]);
    const result = loadScript(url);
    script.dispatchEvent(new Event("error"));
    await expect(result).rejects.toThrow(`Failed to load script: ${url}`);
  });

  test("one that has loaded resolves at once", async () => {
    timing([{ name: url }]);
    await expect(loadScript(url)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("one that has loaded without the global it defines gets a fresh tag", async () => {
    timing([{ name: url }]);
    const result = loadScript(url, null, "dvTestGlobal");
    const tags = [...document.querySelectorAll("script")];
    expect(tags).toHaveLength(2);
    tags[1].dispatchEvent(new Event("load"));
    await expect(result).resolves.toBeUndefined();
  });

  test("one that has loaded with the global it defines resolves at once", async () => {
    timing([{ name: url }]);
    window.dvTestGlobal = {};
    try {
      await expect(loadScript(url, null, "dvTestGlobal")).resolves.toBeUndefined();
      expect(document.querySelectorAll("script")).toHaveLength(1);
    } finally {
      delete window.dvTestGlobal;
    }
  });

  test("one that failed while waited for stays, and the next call adds its own", async () => {
    timing([]);
    const first = loadScript(url);
    script.dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("Failed to load script");
    expect(script.isConnected).toBe(true);

    timing([{ name: url }]);
    const second = loadScript(url);
    const tags = [...document.querySelectorAll("script")];
    expect(tags).toHaveLength(2);
    tags[1].dispatchEvent(new Event("load"));
    await expect(second).resolves.toBeUndefined();
  });
});

describe("getDiagramSvg", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("finds the first svg inside a container", () => {
    document.body.innerHTML = '<div id="box"><svg id="first"></svg><svg></svg></div>';
    expect(getDiagramSvg(document.getElementById("box")).id).toBe("first");
  });

  test("returns an svg the selector matched itself, even with an svg inside it", () => {
    document.body.innerHTML = '<svg id="outer"><svg id="inner"></svg></svg>';
    expect(getDiagramSvg(document.getElementById("outer")).id).toBe("outer");
  });

  test("an svg inside another svg has no diagram of its own", () => {
    document.body.innerHTML = '<svg><g><svg id="inner"></svg></g></svg>';
    expect(getDiagramSvg(document.getElementById("inner"))).toBeNull();
  });

  test("an svg in HTML inside a foreignObject is a diagram again", () => {
    document.body.innerHTML =
      '<svg><foreignObject><div><svg id="deep"></svg></div></foreignObject></svg>';
    expect(getDiagramSvg(document.getElementById("deep")).id).toBe("deep");
  });

  test("an element with no svg, or none at all, gives null", () => {
    document.body.innerHTML = '<div id="empty"></div>';
    expect(getDiagramSvg(document.getElementById("empty"))).toBeNull();
    expect(getDiagramSvg(null)).toBeNull();
  });
});

describe("hasDrawnContent", () => {
  test("is false for an empty svg or one with only defs and style", () => {
    document.body.innerHTML =
      '<svg id="a"></svg><svg id="b"><defs></defs><style>text{}</style></svg>';
    expect(hasDrawnContent(document.getElementById("a"))).toBe(false);
    expect(hasDrawnContent(document.getElementById("b"))).toBe(false);
  });

  test("is true once a shape, text or group is drawn", () => {
    document.body.innerHTML = '<svg id="a"><text>Hi</text></svg>';
    expect(hasDrawnContent(document.getElementById("a"))).toBe(true);
  });
});

describe("getDiagramTitle", () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const title = (html) => {
    document.body.innerHTML = html;
    return getDiagramTitle(document.querySelector("svg"));
  };

  test("data-title, then the svg's own <title>, then a drawn title", () => {
    const svg = (attrs) =>
      `<div data-diagview-index="0" ${attrs}><svg ${NS}><title>Checkout</title><text class="flowchartTitleText">Order flow</text></svg></div>`;
    expect(title(svg('data-title="Payments"'))).toBe("Payments");
    expect(title(svg(""))).toBe("Checkout");
    expect(
      title(
        `<div data-diagview-index="0"><svg ${NS}><text class="flowchartTitleText">Order flow</text></svg></div>`,
      ),
    ).toBe("Order flow");
  });

  test.each([
    ["Gantt", '<text class="titleText">Release plan</text>'],
    ["git", '<text class="gitTitleText">Release plan</text>'],
    ["pie", '<g><path/><text class="pieTitleText">Release plan</text></g>'],
    ["plain", '<text class="title">Release plan</text>'],
  ])("a %s chart title drawn on the diagram names it", (_, drawn) => {
    expect(title(`<svg ${NS}><rect/>${drawn}</svg>`)).toBe("Release plan");
  });

  test("text deeper in the diagram does not name it", () => {
    expect(
      title(
        `<svg ${NS}><g><g><text class="title">Cart</text></g></g><g><svg><text class="titleText">Logo</text></svg></g></svg>`,
      ),
    ).toBe("");
  });

  test("runs of spaces and line breaks read as one space", () => {
    expect(
      title(`<div data-diagview-index="0" data-title=" Order\n  flow "><svg ${NS}/></div>`),
    ).toBe("Order flow");
    expect(title(`<svg ${NS}><text class="titleText">  Order\n   flow </text></svg>`)).toBe(
      "Order flow",
    );
  });

  test("an svg the selector matches itself carries its own data-title", () => {
    document.body.innerHTML = `<svg ${NS} data-diagview-index="0" data-title="Payments"><title>Checkout</title></svg>`;
    const svg = document.querySelector("svg");
    expect(getDiagramTitle(svg)).toBe("Payments");
    expect(getDiagramTitle(svg, svg)).toBe("Payments");
  });

  test("with no svg only the data-title counts", () => {
    const el = document.createElement("div");
    expect(getDiagramTitle(null, el)).toBe("");
    el.setAttribute("data-title", "Payments");
    expect(getDiagramTitle(null, el)).toBe("Payments");
  });
});

describe("isClipboardAvailable", () => {
  afterEach(() => {
    delete global.ClipboardItem;
    delete navigator.clipboard;
  });

  test("needs both clipboard.write and ClipboardItem", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { write: () => Promise.resolve() },
      configurable: true,
    });
    expect(isClipboardAvailable()).toBe(false);
    global.ClipboardItem = class {};
    expect(isClipboardAvailable()).toBe(true);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    expect(isClipboardAvailable()).toBe(false);
  });
});

describe("copyText", () => {
  afterEach(() => {
    delete document.execCommand;
  });

  test("copies through a hidden field and removes it", () => {
    let copied = null;
    document.execCommand = jest.fn(() => {
      const field = document.querySelector("textarea");
      copied = field.value.slice(field.selectionStart, field.selectionEnd);
      return true;
    });
    expect(copyText("line 1\nline 2")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toBe("line 1\nline 2");
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("returns false when the browser refuses and undefined without execCommand", () => {
    document.execCommand = jest.fn(() => false);
    expect(copyText("x")).toBe(false);
    delete document.execCommand;
    expect(copyText("x")).toBeUndefined();
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("removes the field when execCommand throws", () => {
    document.execCommand = jest.fn(() => {
      throw new Error("Hard fail");
    });
    expect(() => copyText("x")).toThrow("Hard fail");
    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("isMobileDevice", () => {
  const original = window.matchMedia;
  let coarse;

  beforeEach(() => {
    coarse = false;
    window.matchMedia = jest.fn((query) => ({
      matches: query === "(pointer: coarse)" && coarse,
    }));
    watchViewport(false);
  });

  afterEach(() => {
    watchViewport(false);
    window.matchMedia = original;
  });

  test("keeps its answer until the window is resized", () => {
    expect(isMobileDevice()).toBe(false);
    coarse = true;
    expect(isMobileDevice()).toBe(false);
    window.dispatchEvent(new Event("resize"));
    expect(isMobileDevice()).toBe(true);
    coarse = false;
    window.dispatchEvent(new Event("orientationchange"));
    expect(isMobileDevice()).toBe(false);
  });

  test("adds its listeners on first use and watchViewport(false) removes them", () => {
    const add = jest.spyOn(window, "addEventListener");
    const remove = jest.spyOn(window, "removeEventListener");
    try {
      isMobileDevice();
      isMobileDevice();
      const added = add.mock.calls.map(([type]) => type);
      expect(added).toEqual(["resize", "orientationchange"]);

      watchViewport(false);
      expect(remove.mock.calls).toEqual(add.mock.calls);

      // Asked again after a teardown, it measures again and listens again
      coarse = true;
      expect(isMobileDevice()).toBe(true);
      expect(add).toHaveBeenCalledTimes(4);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});

describe("fixIds on a large <style> block", () => {
  // The rewrite as it was written before, which tested the whole text in
  // front of each "#" again
  const CSS_ID_RE = /#((?:\\.|[a-zA-Z0-9_.:-])+)/g;
  const reference = (css, ids, prefix) =>
    css.replace(CSS_ID_RE, (match, rawId, offset) => {
      const before = css.slice(0, offset);
      const insideUrl = /url\s*\(\s*['"]?\s*$/i.test(before);
      if (!insideUrl && /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawId)) {
        const declStart = Math.max(
          before.lastIndexOf("{"),
          before.lastIndexOf("}"),
          before.lastIndexOf(";"),
        );
        if (before.slice(declStart + 1).includes(":")) return match;
      }
      let candidate = rawId;
      while (candidate) {
        const id = candidate.replace(/\\(.)/g, "$1");
        if (ids.has(id)) return `#${prefix}-${candidate}${rawId.slice(candidate.length)}`;
        const cut = candidate.search(/[.:](?=[^.:]*$)/);
        if (cut <= 0 || candidate[cut - 1] === "\\") break;
        candidate = candidate.slice(0, cut);
      }
      return match;
    });

  test("gives the same text as before for Mermaid style rules and odd url() spacing", () => {
    const ids = ["m1", "fade", "cafe", "bed", "arrow", "a.b"];
    // A seeded mix of the forms a Mermaid <style> and hand-written CSS use.
    // The seed is fixed, so a failure comes back on the next run.
    let seed = 7;
    const nextRandom = () => (seed = (seed * 16807) % 2147483647);
    const pick = (list) => list[nextRandom() % list.length];
    const parts = [
      "#m1 .node rect{fill:#fff;stroke:#bed;}",
      "#m1 .edge{marker-end:url(#arrow);}",
      ".x{fill:url( '#fade' )}",
      '.y{fill:URL(\n\t"#cafe"  )}',
      ".z{fill:url  (#bed)}",
      ".q{fill:url(  \t #cafe)}",
      "#bed{color:#1234}",
      "#a\\.b:hover{fill:#fade}",
      "myurl(#fade)",
      "url(x#bed) ",
      "#cafe;",
      "(#bed",
      "'#fade'",
      "url('#m1')",
      "#nope{fill:#abc}",
    ];
    const css = Array.from({ length: 4000 }, () => pick(parts)).join("\n");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ids.forEach((id) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.id = id;
      svg.appendChild(g);
    });
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    svg.appendChild(style);

    fixIds(svg, "dv-9");

    expect(style.textContent).toBe(reference(css, new Set(ids), "dv-9"));
    expect(style.textContent).not.toBe(css);
  });
});
