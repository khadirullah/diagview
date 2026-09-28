import { jest } from "@jest/globals";
import { pickFontFaces, embedDocumentFonts } from "../src/features/export-fonts.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** An export-like SVG: one <text> per run, with the font inline */
function svgWith(...runs) {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [text, font = {}] of runs) {
    const t = document.createElementNS(SVG_NS, "text");
    t.style.fontFamily = font.family ?? '"Brand Sans", system-ui, sans-serif';
    if (font.weight) t.style.fontWeight = font.weight;
    if (font.style) t.style.fontStyle = font.style;
    t.textContent = text;
    svg.appendChild(t);
  }
  return svg;
}

const face = (family, weight = "", style = "", range = "") => ({ family, weight, style, range });
const picked = (faces, svg) => faces.filter((f) => pickFontFaces(faces, svg).has(f));

describe("pickFontFaces", () => {
  test("uses the first family in the list that has @font-face rules", () => {
    const brand = face("brand sans", "400");
    const mono = face("brand mono", "400");
    const faces = [brand, mono];
    expect(picked(faces, svgWith(["Hi"]))).toEqual([brand]);
    expect(picked(faces, svgWith(["Hi", { family: "'BRAND MONO', monospace" }]))).toEqual([mono]);
    // Families without rules are skipped over, generic ones never match
    expect(picked(faces, svgWith(["Hi", { family: "Nope, Brand Mono" }]))).toEqual([mono]);
    expect(picked(faces, svgWith(["Hi", { family: "sans-serif" }]))).toEqual([]);
  });

  test("picks the weight the browser would", () => {
    const w = (n) => face("brand sans", n);
    const faces = [w("200"), w("400"), w("500"), w("800")];
    const weightFor = (want, list = faces) =>
      picked(list, svgWith(["Hi", { weight: want }])).map((f) => f.weight);
    expect(weightFor("400")).toEqual(["400"]);
    // Below 400, lighter first
    expect(weightFor("300")).toEqual(["200"]);
    // Above 500, heavier first
    expect(weightFor("600")).toEqual(["800"]);
    expect(weightFor("900")).toEqual(["800"]);
    // Between 400 and 500, heavier up to 500, then lighter, then heavier
    expect(weightFor("450")).toEqual(["500"]);
    expect(weightFor("450", [w("300"), w("700")])).toEqual(["300"]);
    expect(weightFor("450", [w("700"), w("900")])).toEqual(["700"]);
    // Keywords
    expect(weightFor("700", [w("normal"), w("bold")])).toEqual(["bold"]);
  });

  test("matches weight ranges of variable fonts", () => {
    const range = face("brand sans", "800 900");
    const regular = face("brand sans", "400");
    const faces = [regular, range];
    expect(picked(faces, svgWith(["Hi", { weight: "850" }]))).toEqual([range]);
    expect(picked(faces, svgWith(["Hi", { weight: "700" }]))).toEqual([range]);
    expect(picked(faces, svgWith(["Hi", { weight: "300" }]))).toEqual([regular]);
    expect(
      picked([face("brand sans", "100 900")], svgWith(["Hi", { weight: "650" }])),
    ).toHaveLength(1);
  });

  test("falls back between styles the way the browser does", () => {
    const normal = face("brand sans", "400", "normal");
    const italic = face("brand sans", "400", "italic");
    const oblique = face("brand sans", "400", "oblique 0deg 20deg");
    expect(picked([normal, italic], svgWith(["Hi", { style: "italic" }]))).toEqual([italic]);
    expect(picked([normal, oblique], svgWith(["Hi", { style: "italic" }]))).toEqual([oblique]);
    expect(picked([normal, italic], svgWith(["Hi"]))).toEqual([normal]);
    expect(picked([italic, oblique], svgWith(["Hi"]))).toEqual([oblique]);
    // Style comes before weight
    const boldNormal = face("brand sans", "700", "normal");
    expect(picked([boldNormal, italic], svgWith(["Hi", { weight: "400" }]))).toEqual([boldNormal]);
  });

  test("keeps only the unicode-range subsets the text uses", () => {
    const latin = face("brand sans", "400", "", "U+0000-00FF, U+0131, U+2000-206F");
    const cyrillic = face("brand sans", "400", "", "U+0400-045F, U+0490-0491");
    const cjk = face("brand sans", "400", "", "U+4E??");
    const faces = [latin, cyrillic, cjk];
    expect(picked(faces, svgWith(["Hello"]))).toEqual([latin]);
    expect(picked(faces, svgWith(["Привет"]))).toEqual([cyrillic]);
    expect(picked(faces, svgWith(["Hi Привет"]))).toEqual([latin, cyrillic]);
    expect(picked(faces, svgWith(["中"]))).toEqual([cjk]);
    // A subset of another weight is not used for a missing character
    const boldGreek = face("brand sans", "700", "", "U+0370-03FF");
    expect(picked([latin, boldGreek], svgWith(["αβ"]))).toEqual([]);
  });

  test("keeps a rule when it can't tell", () => {
    const regular = face("brand sans", "400");
    const odd = face("brand sans", "heavy");
    const noRange = face("brand sans", "400", "", "");
    const badRange = face("brand sans", "400", "", "latin");
    const bold = face("brand sans", "700");
    expect(picked([regular, odd, bold], svgWith(["Hi"]))).toEqual([regular, odd]);
    expect(picked([noRange, badRange, bold], svgWith(["Hi"]))).toEqual([noRange, badRange]);
  });

  test("reads text runs only, from the fonts carried inline", () => {
    const svg = svgWith(["Hi"]);
    // <style> and <title> get no font in the clone. They, whitespace and
    // other elements without a font of their own are skipped.
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = "text { font-family: 'Brand Mono' }";
    svg.appendChild(style);
    const g = document.createElementNS(SVG_NS, "g");
    g.textContent = "Привет";
    svg.appendChild(g);
    svg.appendChild(document.createTextNode("\n  "));
    const latin = face("brand sans", "400", "", "U+0000-00FF");
    const cyrillic = face("brand sans", "400", "", "U+0400-045F");
    const mono = face("brand mono", "400");
    expect(picked([latin, cyrillic, mono], svg)).toEqual([latin]);
  });

  test("covers HTML labels inside foreignObject", () => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const fo = document.createElementNS(SVG_NS, "foreignObject");
    const span = document.createElement("span");
    span.style.fontFamily = "Brand Mono";
    span.style.fontWeight = "700";
    span.textContent = "label";
    fo.appendChild(span);
    svg.appendChild(fo);
    const regular = face("brand mono", "400");
    const bold = face("brand mono", "700");
    expect(picked([regular, bold], svg)).toEqual([bold]);
  });
});

describe("embedDocumentFonts", () => {
  let styleEl, fetchMock;

  beforeEach(() => {
    styleEl = document.createElement("style");
    styleEl.textContent = [
      "@font-face { font-family: 'Brand Sans'; font-weight: 400; src: url(/f/sans-400.woff2); unicode-range: U+0000-00FF; }",
      "@font-face { font-family: 'Brand Sans'; font-weight: 400; src: url(/f/sans-400-cyr.woff2); unicode-range: U+0400-045F; }",
      "@font-face { font-family: 'Brand Sans'; font-weight: 700; src: url(/f/sans-700.woff2); }",
      "@font-face { font-family: 'Brand Mono'; font-weight: 400; src: url(/f/mono.woff2); }",
    ].join("\n");
    document.head.appendChild(styleEl);
    // jsdom has neither document.fonts nor a global CSSFontFaceRule
    const rule = styleEl.sheet.cssRules[0];
    global.CSSFontFaceRule = Object.getPrototypeOf(rule).constructor;
    Object.defineProperty(document, "fonts", {
      value: { ready: Promise.resolve() },
      configurable: true,
    });
    fetchMock = jest.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["font"], { type: "font/woff2" }),
    }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    styleEl.remove();
    delete global.CSSFontFaceRule;
    delete global.fetch;
    delete document.fonts;
  });

  const fetched = () => fetchMock.mock.calls.map((c) => String(c[0]).replace(/^.*\/f\//, ""));

  test("fetches and embeds only the faces the text uses", async () => {
    const svg = svgWith(["Hello"]);
    await embedDocumentFonts(svg);
    expect(fetched()).toEqual(["sans-400.woff2"]);
    const css = svg.querySelector("style.dv-font-embed").textContent;
    expect(css.match(/@font-face/g)).toHaveLength(1);
    expect(css).toMatch(/url\('data:font\/woff2;base64,/);
  });

  test('"all" embeds every face and "none" fetches nothing', async () => {
    const all = svgWith(["Hello"]);
    await embedDocumentFonts(all, "all");
    expect(fetched()).toEqual([
      "sans-400.woff2",
      "sans-400-cyr.woff2",
      "sans-700.woff2",
      "mono.woff2",
    ]);
    expect(all.querySelector("style.dv-font-embed").textContent.match(/@font-face/g)).toHaveLength(
      4,
    );

    fetchMock.mockClear();
    const none = svgWith(["Hello"]);
    await embedDocumentFonts(none, "none");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(none.querySelector("style")).toBeNull();
  });

  test("strict mode empties a font link it could not embed", async () => {
    styleEl.textContent +=
      "\n@font-face { font-family: 'Remote'; src: url(https://fonts.example.com/r.woff2); }";
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("example.com")) throw new TypeError("Failed to fetch");
      return { ok: true, blob: async () => new Blob(["font"], { type: "font/woff2" }) };
    });
    const runs = [["Hello"], ["World", { family: "Remote, sans-serif" }]];

    const strict = svgWith(...runs);
    await embedDocumentFonts(strict, "used", true);
    const css = strict.querySelector("style.dv-font-embed").textContent;
    expect(css).not.toContain("fonts.example.com");
    expect(css).toContain("url(data:,)");
    expect(css).toMatch(/url\('data:font\/woff2;base64,/);

    // Other modes keep the link, as they allow remote resources
    const other = svgWith(...runs);
    await embedDocumentFonts(other, "used");
    expect(other.querySelector("style.dv-font-embed").textContent).toContain("fonts.example.com");
  });

  test("adds nothing when the text uses no page font", async () => {
    const svg = svgWith(["Hello", { family: "Arial, sans-serif" }]);
    await embedDocumentFonts(svg);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(svg.querySelector("style.dv-font-embed")).toBeNull();
  });

  test("warns once per stylesheet whose rules it can't read", async () => {
    const locked = (href) => ({
      href,
      get cssRules() {
        throw new DOMException("Cannot access rules", "SecurityError");
      },
    });
    const sheets = [
      ...document.styleSheets,
      locked("https://fonts.example.com/css?family=A"),
      locked("https://fonts.example.com/css?family=B"),
      locked(null),
    ];
    Object.defineProperty(document, "styleSheets", { get: () => sheets, configurable: true });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // "none" reads no stylesheet, so it has nothing to warn about
      await embedDocumentFonts(svgWith(["Hello"]), "none");
      expect(warn).not.toHaveBeenCalled();
      await embedDocumentFonts(svgWith(["Hello"]));
      await embedDocumentFonts(svgWith(["Hello"]));
      expect(warn.mock.calls.map((c) => c[0])).toEqual([
        'DiagView: Can\'t read fonts from https://fonts.example.com/css?family=A. Add crossorigin="anonymous" to its <link> to embed them in exports.',
        'DiagView: Can\'t read fonts from https://fonts.example.com/css?family=B. Add crossorigin="anonymous" to its <link> to embed them in exports.',
      ]);
      // The readable sheet still gets embedded
      expect(fetched()).toEqual(["sans-400.woff2", "sans-400.woff2"]);
    } finally {
      warn.mockRestore();
      delete document.styleSheets;
    }
  });
});
