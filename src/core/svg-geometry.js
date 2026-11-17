/**
 * DiagView SVG geometry helpers
 * Sizes, centring, client-pixel matrices and <switch> children
 * @module core/svg-geometry
 */

// Cached screenToClientMatrix() result and the view it was measured in
let _screenFix;
let _screenView = "";

/**
 * Drop the cached screenToClientMatrix() result, so the next getClientCTM()
 * measures it again. The viewport watch runs this on a resize and on
 * destroy().
 */
export function forgetScreenFix() {
  _screenFix = undefined;
}

/**
 * Robust dimension calculator
 * Prioritizes BBox to ensure we capture the actual visible content area,
 * preventing alignment issues if the diagram doesn't start at 0,0.
 *
 * @param {SVGSVGElement} svg - The SVG element
 * @returns {object} Dimensions object {x, y, w, h, src}
 */
export function getRobustDimensions(svg) {
  if (!svg) return { x: 0, y: 0, w: 0, h: 0, src: "none" };

  // 1. Try BBox (Best for centering content)
  // We prioritize this because we want to know where the *ink* is, not just the canvas size.
  try {
    const bbox = svg.getBBox();
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height, src: "bbox" };
    }
  } catch (e) {
    // Ignore BBox errors (e.g. if not attached to DOM)
  }

  // 2. Try viewBox
  if (svg.hasAttribute("viewBox")) {
    // Numbers may be split by spaces, commas or both, as in "0, 0, 10, 10"
    const vb = (svg.getAttribute("viewBox") || "")
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      return { x: vb[0], y: vb[1], w: vb[2], h: vb[3], src: "viewBox" };
    }
  }

  // 3. Fallback to bounding client rect
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { x: 0, y: 0, w: rect.width, h: rect.height, src: "rect" };
  }

  console.warn("DiagView: Could not determine SVG dimensions. Using 400x300 fallback.");
  return { x: 0, y: 0, w: 400, h: 300, src: "fallback" };
}

/**
 * Adjust an SVG's viewBox to center its actual content (ink)
 * This fixes diagrams with internal offsets (like Mermaid) without
 * breaking the browser's native 'fit-to-container' scaling.
 *
 * @param {SVGSVGElement} svg - The SVG diagram to adjust
 */
export function centerSVGViewBox(svg) {
  const d = getRobustDimensions(svg);
  if (d.w === 0 || d.h === 0) return;

  // Add 5% padding to ensure edges aren't tight
  const padding = Math.max(d.w, d.h) * 0.05;
  const vx = d.x - padding;
  const vy = d.y - padding;
  const vw = d.w + padding * 2;
  const vh = d.h + padding * 2;

  svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

/**
 * Screen pixels -> client pixels, or null when the two already agree.
 *
 * WebKit scales getScreenCTM() by the page zoom (a pinch zoom, or a phone
 * showing a page without a viewport meta tag at its zoomed-out initial
 * scale), while getBoundingClientRect() and mouse clientX/Y stay in layout
 * pixels. Chromium and Gecko report both in the same pixels. A hidden
 * 100x100 SVG without a viewBox is measured both ways to get the mapping.
 *
 * @returns {{a: number, b: number, c: number, d: number, e: number, f: number}|null}
 *   The correction, or null if none is needed
 * @private
 */
function screenToClientMatrix() {
  const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  probe.setAttribute("width", "100");
  probe.setAttribute("height", "100");
  probe.style.cssText =
    "position:absolute;left:0;top:0;width:100px;height:100px;margin:0;padding:0;" +
    "border:0;transform:none;visibility:hidden;pointer-events:none";
  // Outside <body>, so the diagram MutationObserver never sees it
  document.documentElement.appendChild(probe);
  try {
    const m = probe.getScreenCTM?.();
    const r = probe.getBoundingClientRect();
    if (!m || !r.width || !r.height || !probe.createSVGMatrix) return null;
    const sx = r.width / 100;
    const sy = r.height / 100;
    const agree =
      Math.abs(m.a - sx) < 1e-6 &&
      Math.abs(m.d - sy) < 1e-6 &&
      Math.abs(m.b) < 1e-6 &&
      Math.abs(m.c) < 1e-6 &&
      Math.abs(m.e - r.left) < 1e-3 &&
      Math.abs(m.f - r.top) < 1e-3;
    if (agree) return null;
    // WebKit's SVGPoint.matrixTransform only takes an SVGMatrix, not a
    // DOMMatrix, so stay in SVGMatrix throughout
    const client = Object.assign(probe.createSVGMatrix(), { a: sx, d: sy, e: r.left, f: r.top });
    const { a, b, c, d, e, f } = client.multiply(m.inverse());
    return { a, b, c, d, e, f };
  } finally {
    probe.remove();
  }
}

/**
 * Write Panzoom's current pan and scale to the DOM now. Panzoom applies
 * them on the next frame, and a running transition shows a halfway value,
 * so without this a measurement can see an old view and a new viewBox can
 * paint one frame at the old pan.
 * @param {*} pz - Panzoom instance
 * @param {Element|null} el - The element Panzoom moves
 */
export function applyTransformNow(pz, el) {
  const opts = pz?.getOptions?.();
  if (!el || typeof opts?.setTransform !== "function") return;
  el.style.transition = "none";
  opts.setTransform(el, { ...pz.getPan(), scale: pz.getScale() }, opts);
}

/**
 * An element's getScreenCTM() in client pixels, the space of
 * getBoundingClientRect() and mouse clientX/Y, in every engine.
 *
 * @param {SVGGraphicsElement} el - The SVG element
 * @returns {SVGMatrix|null} The matrix, or null if there is none
 */
export function getClientCTM(el) {
  const ctm = el?.getScreenCTM?.();
  if (!ctm) return null;
  // The probe forces a layout, and panning with the minimap reads CTMs many
  // times a second. Its result only changes with the zoom, size or scroll
  // of the page, so it is measured again only when one of those changed.
  const vv = window.visualViewport;
  const view = [
    window.scrollX,
    window.scrollY,
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
    vv?.scale,
    vv?.offsetLeft,
    vv?.offsetTop,
    vv?.width,
    vv?.height,
  ].join();
  if (_screenFix === undefined || view !== _screenView) {
    _screenFix = screenToClientMatrix();
    _screenView = view;
  }
  const svg = el.ownerSVGElement || el;
  if (!_screenFix || !svg.createSVGMatrix) return ctm;
  return Object.assign(svg.createSVGMatrix(), _screenFix).multiply(ctm);
}

/** Extensions that browsers support in requiredExtensions */
const EXTENSIONS = ["http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML"];

/**
 * Whether a child of a <switch> passes its test attributes, the way browsers
 * decide it. requiredFeatures always passes.
 * @param {Element} el - Direct child of a switch
 * @returns {boolean} True when the attributes allow it to be drawn
 */
function passesTests(el) {
  const ext = el.getAttribute("requiredExtensions");
  if (ext !== null) {
    const list = ext.split(/\s+/).filter(Boolean);
    if (!list.length || list.some((x) => !EXTENSIONS.includes(x))) return false;
  }
  const lang = el.getAttribute("systemLanguage");
  if (lang === null) return true;
  const primary = (tag) => tag.trim().split("-")[0].toLowerCase();
  const user = (navigator.languages || [navigator.language]).map(primary);
  return lang.split(",").some((tag) => user.includes(primary(tag)));
}

/**
 * The child of a <switch> that is drawn. A switch draws only its first child
 * that passes its tests, like the HTML label in a draw.io switch, and never
 * the <text> fallback after it.
 * @param {Element} sw - A switch element
 * @returns {Element|undefined} The drawn child, if any passes
 */
export function drawnChild(sw) {
  return [...sw.children].find(passesTests);
}

/**
 * The <switch> that leaves the element undrawn, if one does. Firefox still
 * gives a draw.io <text> fallback a real box, so the box alone cannot tell.
 * @param {Element} el - Element in the diagram
 * @returns {Element|null} The switch that skips it, or null when it is drawn
 */
export function undrawnSwitch(el) {
  for (let n = el; n.parentElement; n = n.parentElement) {
    const parent = n.parentElement;
    if (parent.localName === "switch" && drawnChild(parent) !== n) return parent;
  }
  return null;
}
