/**
 * DiagView SVG sanitizer
 * Cleans SVG strings and nodes by walking their DOM
 * @module core/sanitize
 */

/**
 * Tag blocklist for PERMISSIVE mode.
 * Covers only the most critical, universally-dangerous injection tags.
 * This matches the legacy (v0.x) sanitization behavior, plus the HTML
 * head elements (<link>, <base>, <meta>) that can load stylesheets,
 * rebase relative URLs or trigger redirects from inside <foreignObject>.
 * They are never legitimate inside an SVG diagram. An HTML <template>
 * keeps its markup outside its child nodes, where the walk below never
 * looks, and the string returned would carry that markup to the page.
 * @private
 */
const PERMISSIVE_BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "applet",
  "embed",
  "form",
  "link",
  "base",
  "meta",
  "template",
]);

/**
 * Tag blocklist for STRICT mode (default).
 * Extends PERMISSIVE by also blocking SVG-specific animation, filter,
 * and embedding vectors commonly used in modern SVG XSS attacks.
 * @private
 */
const STRICT_BLOCKED_TAGS = new Set([
  ...PERMISSIVE_BLOCKED_TAGS,
  // "foreignobject", // MOVED to conditional check in cleanElement to support Mermaid labels
  "math",
  "feimage",
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
  "mpath",
  "tref",
]);

/**
 * SMIL animation elements. Strict mode drops them all; permissive mode
 * keeps them unless they rewrite a URL-bearing or event attribute, since
 * <animate attributeName="href" values="javascript:..."> is as dangerous
 * as the attribute itself.
 * @private
 */
const ANIMATION_TAGS = new Set([
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "set",
]);

/**
 * The attribute an animation element writes, lower case with any prefix
 * removed, so "HREF" and "xl:href" both read as "href".
 * @private
 */
function animationTarget(el) {
  const target = (el.getAttribute("attributeName") || "").trim().toLowerCase();
  return target.slice(target.lastIndexOf(":") + 1);
}

/**
 * True when an animation element targets href/xlink:href (any prefix) or
 * an on* event handler attribute.
 * @private
 */
function animatesDangerousAttribute(el) {
  const local = animationTarget(el);
  return local === "href" || local.startsWith("on");
}

/**
 * Count the code an animation would write: an event handler, or a
 * javascript: link in href. Its markup holds every value it can write.
 * @private
 */
function noteAnimatedCode(el, removed) {
  const local = animationTarget(el);
  if (local.startsWith("on")) removed.handlers.push(local);
  else if (local === "href" && /javascript:/i.test(normalizeURLValue(el.outerHTML))) removed.urls++;
}

/**
 * Matches dangerous URL protocols in href, src, action and formaction.
 * Blocks javascript:, vbscript:, and data: URIs by default.
 * Test only values passed through normalizeURLValue(); the scheme colon is
 * anchored so benign names like "javascript-guide.html" are not stripped.
 * @private
 */
const DANGEROUS_URL_RE = /^(?:javascript|vbscript|data):/i;

/**
 * Browsers strip ASCII control characters and whitespace (tab, CR, LF, ...)
 * when parsing URLs, so "java\tscript:alert(1)" executes as "javascript:".
 * Normalize attribute values the same way before scheme-testing them,
 * otherwise embedded whitespace bypasses the check.
 * @private
 */
function normalizeURLValue(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0020]/g, "");
}

/**
 * Patterns that represent active danger (script execution) in CSS.
 * Covers: expression(), javascript:, vbscript:, and hex-encoded bypasses.
 * @private
 */
const INTERNAL_DANGER_RE =
  /(?:javascript:|vbscript:|expression\s*\(|url\s*\(\s*['"]?javascript:|@import\s+['"]?javascript:|(?:\\[0-9a-f]{1,6}\s?)+|\\u[0-9a-f]{4})/i;

/**
 * One CSS escape, in order: a backslash before a line break, hex digits
 * with an optional space after them, \u and four hex digits, or any other
 * single character.
 * @private
 */
const CSS_ESCAPE_RE = /\\(?:\r\n|[\n\r\f]|([0-9a-fA-F]{1,6})\s?|[uU]([0-9a-fA-F]{4})|([\s\S]))/g;

/**
 * Decode CSS hex/unicode escapes before pattern-matching.
 * Handles \6a, \000061, \6a  (with trailing space) and \u0041 forms.
 * Each escape is decoded once, left to right, so "\\" is one backslash
 * and the "e" after it in "\\evil" stays a letter.
 * @private
 */
function decodeCSSEscapes(str) {
  if (!str || !str.includes("\\")) return str;
  return str.replace(CSS_ESCAPE_RE, (_, hex, unicode, char) => {
    // Single-character escapes (\/ -> "/", \i -> "i") are the literal
    // character in CSS and would otherwise split "//" or "@import".
    if (char !== undefined) return char;
    // A backslash before a line break in a quoted string joins the two
    // lines, so "ht\<newline>tps:" reads as "https:"
    const code = hex ?? unicode;
    if (code === undefined) return "";
    try {
      return String.fromCodePoint(parseInt(code, 16));
    } catch (e) {
      return "";
    }
  });
}

/**
 * A CSS comment. One without an end runs to the end of the text.
 * @private
 */
const CSS_COMMENT_RE = /\/\*[\s\S]*?(?:\*\/|$)/g;

/**
 * The parts of CSS a comment cannot start in, and the comments themselves.
 * In order: an escaped character, a quoted string, the inside of brackets
 * up to a quote or the closing bracket, and a comment.
 * @private
 */
const CSS_PARTS_RE =
  /\\[\s\S]|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?|\((?:\\[\s\S]|[^)"'\\])*\)?|\/\*[\s\S]*?(?:\*\/|$)/g;

/**
 * Remove CSS comments from a string. A "/*" inside a quoted string is
 * text, so a comment never runs across a string. In an unquoted url() it
 * is part of the URL, so a comment inside brackets ends at the bracket.
 * @private
 */
function stripCSSComments(str) {
  if (!str || !str.includes("/*")) return str;
  return str.replace(CSS_PARTS_RE, (part) => {
    if (part.startsWith("/*")) return "";
    if (part.startsWith("(")) return part.replace(CSS_COMMENT_RE, "");
    return part;
  });
}

/**
 * CSS the way the checks below read it. Comments go first, because an
 * escape such as \2f\2a makes the text "/*" but never starts a comment.
 * @private
 */
function readableCSS(css) {
  return decodeCSSEscapes(stripCSSComments(css));
}

/**
 * A URL in CSS: the value of url(), or a quoted string right after "(" or
 * ",", as image-set() takes one. Group 1 or 2 holds a quoted value, group
 * 3 one without quotes.
 * @private
 */
const CSS_URL_RE = /(?:url\s*\(|[(,](?=\s*['"]))\s*(?:"([^"]*)|'([^']*)|([^)\s]*))/gi;

/**
 * Whether a URL loads from another origin than the page. The browser's URL
 * parser reads it, so "//host", "/\host" and "\\host" all name another
 * host. Relative paths, "#id" and data: URLs stay on the page. A URL that
 * does not parse counts as remote.
 * @param {string} url - The URL as written
 * @returns {boolean} True when it names another origin
 * @private
 */
function isRemoteUrl(url) {
  try {
    const base = new URL(document.baseURI);
    const { origin } = new URL(url, base);
    return origin !== "null" && origin !== base.origin;
  } catch (e) {
    return true;
  }
}

/**
 * Whether CSS from readableCSS() loads anything from another origin: an
 * @import, or a url() or image-set() URL that isRemoteUrl() finds remote.
 * @private
 */
function loadsRemoteCSS(css) {
  if (/@import\b/i.test(css)) return true;
  for (const match of css.matchAll(CSS_URL_RE)) {
    if (isRemoteUrl(match[1] ?? match[2] ?? match[3])) return true;
  }
  return false;
}

/**
 * Lower-cased local name of an element or attribute with any namespace
 * prefix removed. DOMParser exposes the prefix separately (localName is
 * already bare); the HTML parser keeps "svg:script" as the localName, so
 * strip up to the last colon in both cases.
 * @param {Element|Attr} node - Element or attribute node
 * @returns {string} Bare lower-case name
 * @private
 */
function localNameOf(node) {
  const raw = node.localName || node.name || node.tagName || "";
  return raw.slice(raw.lastIndexOf(":") + 1).toLowerCase();
}

let inertDoc;

/**
 * A document with no window. Copies made in it load no images and run no
 * event handlers, so the sanitizer can clean them before the page gets them.
 * @returns {Document} The shared inert document
 */
export function inertDocument() {
  return (inertDoc ||= document.implementation.createHTMLDocument(""));
}

/**
 * Options for sanitizeSVG().
 * @typedef {object} SanitizeOptions
 * @property {number} [maxChars] - Block input longer than this. A Node is measured by its serialized length
 * @property {boolean} [allowRemoteResources] - Keep external fonts and stylesheets
 * @property {string[]} [allowedImageTypes] - Image types allowed in data URLs
 * @property {RemovedCode} [removed] - Counts the code the sanitizer removes
 */

/**
 * Code that sanitizeSVG() removed: <script> elements, on* event handler
 * names, and javascript: links, including ones an animation would write.
 * Start with { scripts: 0, handlers: [], urls: 0 }.
 * @typedef {object} RemovedCode
 * @property {number} scripts - <script> elements
 * @property {string[]} handlers - Event handler attribute names, one per removal
 * @property {number} urls - javascript: links
 */

/**
 * Sanitize an SVG string or DOM Node to prevent XSS.
 *
 * Uses a secure DOM-walking approach (DOMParser + attribute walker) rather
 * than regex-based string replacement, which is trivially bypassed.
 *
 * Three modes are supported:
 * - 'strict'     (default) — Blocks dangerous tags, animation vectors,
 *                            style injection, and external <use> hrefs.
 * - 'permissive'           — Blocks script, iframe, object, applet, embed,
 *                            form, link, base, meta and template, on* attributes,
 *                            dangerous URLs, and SMIL that writes href or on*.
 * - 'off'                  — Returns input unchanged. Use ONLY for SVGs
 *                            from a fully trusted, developer-controlled source.
 *
 * @param {string|Node} input - The SVG string or DOM Node to sanitize.
 * @param {'strict'|'permissive'|'off'} [mode='strict'] - Sanitization mode.
 * @param {number|SanitizeOptions|null} [options=0] - Character limit (number) or options object.
 * @returns {string|Node|null} The sanitized string or Node; "" (string input)
 *   or null (Node input) when the input exceeds maxChars or its root element
 *   is one the mode removes, such as <script>. A Node result is a new copy
 *   that belongs to no page until you insert it.
 */
export function sanitizeSVG(input, mode = "strict", options = 0) {
  return sanitize(input, mode, options, false);
}

/**
 * sanitizeSVG() for a copy the caller made in inertDocument() and owns.
 * The copy is cleaned in place, so it is not copied a second time.
 * @param {Element} copy - The caller's copy, in no page
 * @param {'strict'|'permissive'|'off'} mode - Sanitization mode
 * @param {SanitizeOptions} options - As for sanitizeSVG()
 * @returns {Element|null} The copy, or null as sanitizeSVG() returns it
 */
export function sanitizeInPlace(copy, mode, options) {
  return /** @type {Element|null} */ (sanitize(copy, mode, options, true));
}

/**
 * The work of sanitizeSVG(), which copies a Node first unless `own` is set
 * @private
 */
function sanitize(input, mode, options, own) {
  // Accept a number, an options object, or null/undefined (treated as none).
  if (typeof options !== "object" || options === null) {
    options = { maxChars: typeof options === "number" ? options : 0 };
  }
  const maxChars = options.maxChars || 0;
  const allowRemote = options.allowRemoteResources;
  const removed = options.removed;
  if (!input) return typeof input === "string" ? "" : input;

  // Hard Block for massive input (Security/Stability). Node input is
  // measured by its serialized length so the limit applies to both paths;
  // the serialization only happens when a limit is set.
  if (maxChars > 0) {
    const isNode = typeof input !== "string" && input instanceof Node;
    const size = isNode
      ? (input.outerHTML || "").length
      : typeof input === "string"
        ? input.length
        : 0;
    if (size > maxChars) {
      console.error(`DiagView: SVG exceeds safety limit of ${maxChars} chars. Processing blocked.`);
      return isNode ? null : "";
    }
  }

  // 'off' mode: bypass entirely — caller guarantees source is trusted
  if (mode === "off") return input;

  let root;
  const isString = typeof input === "string";

  if (isString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(input, "image/svg+xml");
      if (doc.querySelector("parsererror")) return "";
      root = doc.documentElement;
    } catch (e) {
      console.error("DiagView: SVG parsing failed", e);
      return "";
    }
  } else if (input instanceof Node) {
    // SEC-2: Ensure we never mutate the original input Node. A copy made
    // in the page would load its images and fire their onerror at once.
    root = own ? input : inertDocument().importNode(input, true);
  } else {
    return input;
  }

  const isStrict = mode !== "permissive";
  const blockedTags = isStrict ? STRICT_BLOCKED_TAGS : PERMISSIVE_BLOCKED_TAGS;

  // Returns false when it removed el
  const cleanElement = (el) => {
    if (el.nodeType !== 1) {
      // The string comes back with comments, processing instructions and
      // CDATA as written, and an HTML parser ends those at the first ">".
      // Markup inside them would then run in the page. CDATA turns into
      // plain text, so labels and CSS keep their content.
      if (el.nodeType === 4) el.replaceWith(el.data);
      else if (el.nodeType !== 3) el.remove();
      return;
    }

    // Compare the local name so prefixed forms (<svg:script>, <h:iframe>)
    // are treated like their unprefixed counterparts. The HTML parser keeps
    // the prefix inside localName, so strip anything before the last colon.
    const tagName = localNameOf(el);

    // Remove blocked tags entirely — no further processing needed
    if (blockedTags.has(tagName)) {
      if (removed) {
        if (tagName === "script") removed.scripts++;
        else if (ANIMATION_TAGS.has(tagName)) noteAnimatedCode(el, removed);
      }
      el.remove();
      return false;
    }

    // Permissive keeps SMIL animations, but never ones that write href or
    // an on* attribute — those are script execution by another route.
    if (!isStrict && ANIMATION_TAGS.has(tagName) && animatesDangerousAttribute(el)) {
      if (removed) noteAnimatedCode(el, removed);
      el.remove();
      return false;
    }

    // Strict keeps <foreignObject>, as Mermaid puts its HTML labels in it,
    // and cleans what it holds like any other element. Browsers load
    // nothing from src or data on a <foreignObject>, so removing one that
    // names an http(s) URL there is a precaution. It does not stop script.
    if (isStrict && tagName === "foreignobject") {
      const src = el.getAttribute("src") || el.getAttribute("data") || "";
      if (/^https?:\/\//.test(src)) {
        el.remove();
        return false;
      }
    }

    // Snapshot attributes before iteration — live NamedNodeMap shifts
    // indices when attributes are removed, causing items to be skipped.
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      // Local name again: xl:href bound to the XLink namespace, svg:onclick
      const name = localNameOf(attr);
      const value = attr.value;

      // Remove all event handler attributes (onclick, onload, onerror, etc.)
      if (name.startsWith("on")) {
        removed?.handlers.push(name);
        el.removeAttribute(attr.name);
        continue;
      }

      // Strict only: form="id" ties a diagram button or field to a form on
      // the page, so a click could submit that form
      if (isStrict && name === "form") {
        el.removeAttribute(attr.name);
        continue;
      }

      // Sanitize URL-bearing attributes for dangerous protocols. formaction
      // on a <button> or <input> replaces its form's action when clicked.
      if (["href", "xlink:href", "src", "action", "formaction"].includes(name)) {
        const normalizedValue = normalizeURLValue(value);
        if (DANGEROUS_URL_RE.test(normalizedValue)) {
          // Allow only safe raster data URIs (PNG, JPG, etc.)
          // This blocks data:image/svg+xml which is an XSS vector.
          const types = options.allowedImageTypes || ["png", "jpeg", "webp", "gif"];
          const typePattern = types.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
          const safeRasterRe = new RegExp(`^data:image\\/(?:${typePattern});base64,`, "i");

          if (!safeRasterRe.test(normalizedValue)) {
            if (removed && /^javascript:/i.test(normalizedValue)) removed.urls++;
            el.removeAttribute(attr.name);
            continue;
          }
        }
        // Strict only: block external URL references on <use> elements.
        // <use xlink:href="https://evil.com/xss.svg#payload"> is a
        // cross-origin SVG injection vector that bypasses same-origin policy.
        if (isStrict && tagName === "use" && isRemoteUrl(normalizedValue)) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      // Strict only: sanitize inline style attribute for CSS-based injection.
      if (isStrict && name === "style") {
        const cleanValue = readableCSS(value);
        const isDangerous =
          INTERNAL_DANGER_RE.test(cleanValue) || (!allowRemote && loadsRemoteCSS(cleanValue));
        if (isDangerous) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      // Strict only: fill, stroke, cursor, filter, mask and the other
      // attributes read as CSS load a remote file through url() too
      if (isStrict && !allowRemote && name !== "style" && value.includes("(")) {
        if (loadsRemoteCSS(readableCSS(value))) el.removeAttribute(attr.name);
      }
    }

    // Strict only: sanitize <style> block textContent for CSS-based injection.
    if (isStrict && tagName === "style") {
      const content = el.textContent || "";
      const cleanContent = readableCSS(content);
      const isDangerous =
        INTERNAL_DANGER_RE.test(cleanContent) || (!allowRemote && loadsRemoteCSS(cleanContent));
      if (isDangerous) {
        el.remove();
        return false;
      }
    }

    // Recurse into children using a snapshotted array (safe against DOM mutation)
    const children = Array.from(el.childNodes);
    for (const child of children) {
      cleanElement(child);
    }
  };

  // A fragment has no tag of its own, so clean what it holds. A root the
  // mode removes has no parent to leave, so remove() keeps it whole and
  // nothing of it may be returned.
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    for (const child of Array.from(root.childNodes)) cleanElement(child);
  } else if (cleanElement(root) === false) {
    return isString ? "" : null;
  }

  return isString ? new XMLSerializer().serializeToString(root) : root;
}
