/**
 * Font embedding for exports
 * @module features/export-fonts
 */

/**
 * Fetch a URL and return a base64 data URI, or null on failure.
 * Used to embed fonts so export SVGs render consistently.
 * @private
 * @param {string} url - URL, relative ones resolve against base
 * @param {string} base - Base URL
 */
async function fetchAsDataURI(url, base) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(new URL(url, base).href, { mode: "cors", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/** Stylesheets already warned about in this page session */
const warned = new Set();
const unquote = (s) => s.replace(/["']/g, "").trim().toLowerCase();

/**
 * A CSS font-weight as numbers, "800 900" for a range. NaN when unreadable.
 * @private
 */
const weights = (v) =>
  (v || "400").split(" ").map((x) => (x == "bold" ? 700 : x == "normal" ? 400 : +x));

/**
 * True when a unicode-range covers one of the code points, or is missing
 * or can't be read.
 * @private
 */
const covers = (range, codes) =>
  !range ||
  range.split(",").some((part) => {
    const [a, b = a] = part.trim().slice(2).split("-");
    const lo = parseInt(a.replace(/\?/g, "0"), 16);
    const hi = parseInt(b.replace(/\?/g, "f"), 16);
    return !(hi >= 0) || codes.some((c) => c >= lo && c <= hi);
  });

/**
 * Pick the font face rules the text of an SVG can use, the way the browser
 * picks them. For each text element the first family in its font-family
 * list that has font face rules wins, then the closest style, then the
 * closest weight (CSS Fonts 4 font matching). Of those rules the ones whose
 * unicode-range covers a character of the text are kept. A rule whose
 * weight can't be read is kept.
 * @param {{family: string, weight: string, style: string, range: string}[]} faces - Font face
 *   descriptors, the family in lower case without quotes
 * @param {Element} svgEl - Export clone, with the computed fonts inline
 * @returns {Set<object>} The faces to embed
 */
export function pickFontFaces(faces, svgEl) {
  const keep = new Set();
  for (const el of svgEl.querySelectorAll("*")) {
    // The export clone carries each element's computed font inline
    const { fontFamily, fontStyle, fontWeight } = el.style || {};
    let text = "";
    for (const n of el.childNodes) if (n.nodeType == 3) text += n.data;
    if (!fontFamily || !text.trim()) continue;
    const family = fontFamily
      .split(",")
      .map(unquote)
      .find((f) => faces.some((x) => x.family == f));
    const order = fontStyle[0] == "i" ? "ion" : fontStyle[0] == "o" ? "oin" : "noi";
    const [w] = weights(fontWeight);
    const codes = [...text].map((c) => c.codePointAt(0));
    const scored = faces
      .filter((f) => f.family == family)
      .map((f) => {
        const [lo, hi = lo] = weights(f.weight);
        const heavier = lo > w;
        const lighter = hi < w;
        // Below 400 lighter faces come first, above 500 heavier ones, and
        // in between heavier ones up to 500, then lighter, then the rest
        const miss = w < 400 ? heavier : w > 500 ? lighter : heavier ? 2 * (lo > 500) : lighter;
        const off = Math.max(lo - w, w - hi, 0);
        return [f, order.indexOf((f.style || "n")[0]) * 1e4 + miss * 1e3 + off];
      });
    const best = Math.min(...scored.map((s) => s[1]).filter((n) => n >= 0));
    for (const [f, n] of scored) {
      if (!(n > best) && covers(f.range, codes)) keep.add(f);
    }
  }
  return keep;
}

/**
 * Collect font face rules from loaded document stylesheets
 * and embed referenced font files as base64 data URIs.
 * Mutates the SVG element's first/new <style> block.
 * @param {SVGSVGElement} svgEl - Export clone
 * @param {"used"|"all"|"none"} [mode] - exportFonts, "used" when missing
 */
export async function embedDocumentFonts(svgEl, mode) {
  if (mode == "none" || !document.fonts) return;

  // Wait for all fonts to be loaded before reading metrics / before export
  await document.fonts.ready;

  let fontFaceRules = [];
  for (const sheet of document.styleSheets) {
    try {
      // Relative url()s inside a rule resolve against the stylesheet that
      // declares it (or the page for inline <style> blocks), not the export.
      const base = sheet.href || document.baseURI;
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          const d = (p) => rule.style?.getPropertyValue(p) || "";
          fontFaceRules.push({
            cssText: rule.cssText,
            base,
            family: unquote(d("font-family")),
            weight: d("font-weight"),
            style: d("font-style"),
            range: d("unicode-range"),
          });
        }
      }
    } catch {
      // Only a cross-origin stylesheet loaded without CORS gets here. Say
      // once per stylesheet why its fonts are missing from the export.
      const href = sheet.href;
      if (href && warned.size < warned.add(href).size) {
        console.warn(
          `DiagView: Can't read fonts from ${href}. Add crossorigin="anonymous" to its <link> to embed them in exports.`,
        );
      }
    }
  }

  // Only embed the faces the text uses, so the file stays small
  if (mode != "all") {
    const used = pickFontFaces(fontFaceRules, svgEl);
    fontFaceRules = fontFaceRules.filter((f) => used.has(f));
  }
  if (!fontFaceRules.length) return;

  // Fetch and inline font files referenced by url(...)
  const inlined = await Promise.all(
    fontFaceRules.map(async ({ cssText, base }) => {
      // Replace each url(...) with a base64 data URI. Relative and
      // root-relative references (self-hosted fonts) are made absolute
      // first: copied verbatim they cannot resolve inside a data:/blob: image.
      // data: URLs are left as they are.
      let result = cssText;
      for (const [match, , rawUrl] of cssText.matchAll(/url\((['"]?)(?!data:)([^'")\s]+)\1\)/gi)) {
        const dataURI = await fetchAsDataURI(rawUrl, base);
        if (dataURI) {
          result = result.replace(match, `url('${dataURI}')`);
        }
      }
      return result;
    }),
  );

  // Prepend a <style> with embedded @font-face rules to the SVG
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.classList.add("dv-font-embed");
  styleEl.textContent = inlined.join("\n");
  svgEl.prepend(styleEl);
}
