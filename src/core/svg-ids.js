/**
 * DiagView SVG id prefixing
 * Gives the ids in a copied SVG a unique prefix and updates every reference
 * @module core/svg-ids
 */

/**
 * url(#id) reference in an attribute value: optional whitespace, optional
 * quote, the fragment, and the matching closing quote. Case-insensitive so
 * URL(#id) is rewritten as well.
 * @private
 */
const URL_REF_RE = /(url\s*\(\s*(['"]?)\s*)#([^)'"]+)(\2\s*\))/gi;

/**
 * "#token" inside a <style> block. The token may contain "." and ":" as
 * well as CSS backslash escapes so ids such as "my.grad" are matched whole
 * (url(#my.grad)) or escaped (#my\.grad selector).
 * @private
 */
const CSS_ID_RE = /#((?:\\.|[a-zA-Z0-9_.:-])+)/g;

/**
 * Whether the CSS just before `end` opens a url(), with optional spaces and
 * an optional quote, as /url\s*\(\s*['"]?\s*$/i finds in css.slice(0, end).
 * It reads back from `end` only, so a long <style> is not scanned once per id.
 * @private
 * @param {string} css - Style text
 * @param {number} end - Index of the "#"
 * @returns {boolean} True inside url(
 */
function endsInUrlOpen(css, end) {
  let i = end;
  const skipSpace = () => {
    while (i > 0 && /\s/.test(css[i - 1])) i--;
  };
  skipSpace();
  if (css[i - 1] === '"' || css[i - 1] === "'") {
    i--;
    skipSpace();
  }
  if (css[i - 1] !== "(") return false;
  i--;
  skipSpace();
  return i >= 3 && /^url$/i.test(css.slice(i - 3, i));
}

/**
 * Fix ID collisions in SVG elements using a secure DOM-walking approach.
 * Replaces the unsafe and slow outerHTML/RegExp strategy with direct attribute manipulation.
 * This prevents XSS (no innerHTML parsing) and is significantly faster.
 *
 * @param {SVGElement} svg - The SVG element to fix
 * @param {string} uniqueId - Unique prefix for IDs
 * @returns {SVGElement} - The modified SVG element
 */
export function fixIds(svg, uniqueId) {
  if (!svg || !uniqueId) return svg;

  const idMap = new Map();
  const idElements = svg.querySelectorAll("[id]");

  // 1. Build the ID map
  if (svg.id) {
    const oldId = svg.id;
    const newId = `${uniqueId}-${oldId}`;
    idMap.set(oldId, newId);
    svg.id = newId;
  }

  // OPT-6: Avoid Array.from() for large NodeLists, use standard for-loop
  for (let i = 0; i < idElements.length; i++) {
    const el = idElements[i];
    const oldId = el.id;
    const newId = `${uniqueId}-${oldId}`;
    idMap.set(oldId, newId);

    el.id = newId;
  }

  if (idMap.size === 0) return svg;

  // 2. Walk the DOM and update attribute references (url(#id), href, etc.)
  // Optimize: Only query elements that can actually contain ID references (href, fill, filters, etc.)
  // instead of every single node in the SVG tree.
  // [style*='#'] covers inline style="fill:url(#id)" as written by Inkscape,
  // Illustrator and hand-authored SVGs, where no fill/stroke attribute exists.
  const REF_SELECTOR =
    "use,image,pattern,linearGradient,radialGradient,filter,mask,clipPath," +
    "textPath,a,feImage,[aria-labelledby],[aria-describedby]," +
    "[fill*='#'],[stroke*='#'],[filter*='#'],[clip-path*='#'],[mask*='#']," +
    "[marker-start*='#'],[marker-mid*='#'],[marker-end*='#'],[style*='#']";

  const allElements = svg.querySelectorAll(REF_SELECTOR);
  allElements.forEach((el) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const value = attr.value;

      if (!value) continue;

      // Case C: space-separated id lists (no "#" prefix) used by ARIA
      if (attr.name === "aria-labelledby" || attr.name === "aria-describedby") {
        const newList = value
          .split(/\s+/)
          .map((id) => (idMap.has(id) ? idMap.get(id) : id))
          .join(" ");
        if (newList !== value) attr.value = newList;
        continue;
      }

      if (!value.includes("#")) continue;

      let newValue = value;

      // Case A: Functional notation like url(#id), url('#id') or URL(#id)
      if (/url\s*\(/i.test(value)) {
        newValue = newValue.replace(URL_REF_RE, (match, open, _quote, id, close) => {
          return idMap.has(id) ? `${open}#${idMap.get(id)}${close}` : match;
        });
      }

      // Case B: Direct references in href or xlink:href
      if (attr.name === "href" || attr.name === "xlink:href") {
        if (value.startsWith("#")) {
          const id = value.substring(1);
          if (idMap.has(id)) {
            newValue = `#${idMap.get(id)}`;
          }
        }
      }

      if (newValue !== value) attr.value = newValue;
    }
  });

  // 3. Update references within <style> blocks to ensure CSS styling remains intact
  const styleElements = svg.querySelectorAll("style");
  styleElements.forEach((style) => {
    const css = style.textContent;
    if (!css || !css.includes("#")) return;

    // Replace #id selectors and url(#id) in CSS using the idMap
    const newCss = css.replace(CSS_ID_RE, (match, rawId, offset) => {
      const insideUrl = endsInUrlOpen(css, offset);

      // SEC-5: hex colour detection to avoid accidental ID replacement of
      // #rgb, #rgba, #rrggbb, #rrggbbaa. Only applies in a property value
      // (a "prop:" follows the last "{", "}" or ";" before the match) and
      // never inside url(#...), which can only be an id reference.
      if (!insideUrl && /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawId)) {
        const declStart = Math.max(
          css.lastIndexOf("{", offset - 1),
          css.lastIndexOf("}", offset - 1),
          css.lastIndexOf(";", offset - 1),
        );
        if (css.slice(declStart + 1, offset).includes(":")) return match;
      }

      // Try the whole token first, then shorter prefixes ending before an
      // unescaped "." or ":" so "#node.label" and "#node:hover" still match.
      let candidate = rawId;
      while (candidate) {
        const id = candidate.replace(/\\(.)/g, "$1");
        if (idMap.has(id)) {
          return `#${uniqueId}-${candidate}${rawId.slice(candidate.length)}`;
        }
        const cut = candidate.search(/[.:](?=[^.:]*$)/);
        if (cut <= 0 || candidate[cut - 1] === "\\") break;
        candidate = candidate.slice(0, cut);
      }
      return match;
    });

    if (newCss !== css) style.textContent = newCss;
  });

  return svg;
}
