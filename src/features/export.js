/**
 * DiagView Export Functionality - REFINED
 * Uses robust sizing logic to fix low-res exports
 * @module features/export
 */

import { state } from "../core/config.js";
import { loadChunk } from "../core/lifecycle.js";
import { EXPORT, COLORS, TIMING } from "../core/constants.js";
import { detectTheme, getContrastRatio } from "../core/theme.js";
import {
  downloadFile,
  sanitizeFilename,
  getTimestamp,
  isMobileDevice,
  isClipboardAvailable,
  loadScript,
  getRobustDimensions,
  getDiagramTitle,
  getDiagramSvg,
} from "../core/utils.js";
import { embedDocumentFonts } from "./export-fonts.js";
import { cloneSVGForExportAsync, exportSecurity } from "../core/svg-clone.js";
import {
  showSuccessToast,
  showErrorToast,
  showProgressToast,
  showWarningToast,
} from "../ui/toast.js";

/**
 * Export format for exportDiagram(). "download" is the same as "png", and the
 * "-transparent" modes skip the background fill.
 * @typedef {"png"|"svg"|"jpeg"|"webp"|"pdf"|"copy"|"copy-svg"|"png-transparent"|"webp-transparent"|"download"} ExportMode
 */

/**
 * Options for the export functions. Each function documents which fields it reads.
 * @typedef {object} ExportOptions
 * @property {string} [filename] - File name without extension, generated from the diagram title if empty
 * @property {boolean} [silent] - Skip the processing toast, the JPEG transparency warning,
 *   the warning about labels that are hard to read on the background and the warning about
 *   linked images left out of the file
 * @property {boolean} [transparent] - Skip the background fill
 * @property {SVGSVGElement|null} [modalClone] - Fullscreen clone to export instead of the original SVG
 */

/**
 * Build the export file name from the diagram's title and a timestamp
 * @param {Element} svg - The diagram's SVG on the page
 * @param {Element} [element] - The element passed to the export
 * @returns {string} File name without extension
 */
export function generateFilename(svg, element) {
  // The title comes from the element with the toolbar, so the file name
  // matches the header. In a .mermaid inside a titled .diagram that is the
  // outer element, not the inner match next to the SVG.
  const owner =
    svg.closest("[data-diagview-init]") || element?.closest?.("[data-diagview-index]") || undefined;
  // The same title the header shows
  const rawTitle = getDiagramTitle(svg, owner) || "diagram";

  const cleanTitle = sanitizeFilename(rawTitle, "diagram");
  const finalName = cleanTitle === "diagram" ? "diagram_export" : cleanTitle;
  return `${finalName}_${getTimestamp()}`;
}

/**
 * Find the <svg> inside a source element, or report the problem to the user.
 * The public per-format functions used to dereference the missing SVG in
 * generateFilename() before their try/catch and rejected with a TypeError.
 * @private
 * @param {HTMLElement} sourceElement - Diagram container passed to the export
 * @returns {SVGSVGElement|null} The SVG, or null after showing the error toast
 */
function resolveSourceSvg(sourceElement) {
  const svg = getDiagramSvg(sourceElement);
  if (!svg) showErrorToast("No diagram found");
  return svg;
}

/**
 * A number, or a string that holds one. NaN for anything else, "" included.
 * @private
 */
const toNumber = (v) =>
  typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;

/**
 * One of the allowed watermark values, case and spaces ignored. A missing
 * or empty value gives the first one, the default. An unknown value logs a
 * warning and gives the default too.
 * @private
 * @param {*} value - Value from the config or an attribute
 * @param {string[]} list - Allowed values, the default first
 * @param {string} name - Setting name for the warning
 * @returns {string} The value to use
 */
function oneOf(value, list, name) {
  const v = String(value || list[0])
    .trim()
    .toLowerCase();
  if (list.includes(v)) return v;
  console.warn(
    `DiagView: Unknown watermark ${name} "${value}", expected ${list.join(", ")}. Using ${list[0]}.`,
  );
  return list[0];
}

/**
 * Resolve the watermark style, position, placement and opacity. An unknown
 * style, position or placement logs a warning and uses the default, so a
 * typo still gives a watermark. An opacity outside 0 to 1 is clamped into
 * that range, and one that is not a number uses 0.2. A missing or empty value
 * uses the default without a warning.
 * @private
 */
function resolveWatermark(config) {
  // The first value in each list is the default
  const style = oneOf(config.style, ["corner", "background", "both"], "style");
  const pos = oneOf(
    config.position,
    ["bottom-right", "bottom-left", "top-right", "top-left", "center", "four-sides"],
    "position",
  );
  const placement = oneOf(config.placement, ["diagram", "margin"], "placement");

  const raw = config.opacity;
  let opacity = raw == null || (typeof raw === "string" && !raw.trim()) ? 0.2 : toNumber(raw);
  // NaN fails both tests, so input that is not a number lands here too
  if (!(opacity >= 0 && opacity <= 1)) {
    const fixed = isNaN(opacity) ? 0.2 : Math.min(1, Math.max(0, opacity));
    console.warn(
      `DiagView: Watermark opacity "${raw}" should be a number from 0 to 1. Using ${fixed}.`,
    );
    opacity = fixed;
  }

  return { style, pos, placement, opacity };
}

/**
 * Injects a watermark into the SVG for branding during export.
 * Supports "background" (centered/rotated) and "corner" styles. `pad` is
 * the width of the blank margin the export adds around the diagram.
 * @private
 */
function injectWatermark(svg, d, sourceSvg = null, pad = 0) {
  if (!(svg instanceof SVGElement)) return;

  // 1. Start with global config
  const config = { ...state.config.watermark };

  // 2. Apply element-level overrides if available (A1)
  // Resolve the diagram container from the SVG being exported so the inline
  // toolbar and the public exportTo*(el) API see the same overrides as the
  // modal; state.activeSourceElement is only set while the modal is open.
  let el = null;
  if (sourceSvg?.closest) {
    try {
      el = sourceSvg.closest(state.config.diagramSelector);
    } catch (_e) {
      el = null;
    }
    el = el || sourceSvg.parentElement;
  }
  el = el || state.activeSourceElement;
  if (el && el.dataset) {
    const dataset = el.dataset;
    if (dataset.diagviewWatermark) config.enabled = dataset.diagviewWatermark === "true";
    if (dataset.diagviewWatermarkText) config.text = dataset.diagviewWatermarkText;
    if (dataset.diagviewWatermarkStyle) config.style = dataset.diagviewWatermarkStyle;
    if (dataset.diagviewWatermarkPos) config.position = dataset.diagviewWatermarkPos;
    if (dataset.diagviewWatermarkPlacement) {
      config.placement = dataset.diagviewWatermarkPlacement;
    }
    const raw = dataset.diagviewWatermarkOpacity?.trim();
    if (raw) {
      const n = toNumber(raw);
      if (!isNaN(n)) {
        config.opacity = n;
      } else {
        console.warn(
          `DiagView: data-diagview-watermark-opacity "${raw}" should be a number from 0 to 1. Using the config opacity.`,
        );
      }
    }
  }

  // Final validation before processing
  if (!config.enabled || !config.text || !d || d.w <= 0 || d.h <= 0) return;

  // Detect theme for contrasting color
  const theme = detectTheme();
  const mainColor = theme.isDark ? "#ffffff" : "#000000";
  const contrastColor = theme.isDark ? "#000000" : "#ffffff";

  const { style, pos, placement, opacity } = resolveWatermark(config);

  // Width of the text per pixel of font size. Measured in the browser's
  // bold sans-serif, as "WWW" is far wider than "iii". Without a canvas,
  // 0.6 per character is the average.
  let widthPerPx = config.text.length * 0.6;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "bold 100px sans-serif";
    widthPerPx = ctx.measureText(config.text).width / 100 || widthPerPx;
  } catch {
    // Keep the estimate
  }

  const createWatermarkElement = (fontSize, textOpacity, maxWidth = 0) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = config.text;
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");

    // Safe-Fit Scaling: Automatically fit text to available width without distortion
    let effectiveFontSize = fontSize;
    if (maxWidth > 0 && fontSize * widthPerPx > maxWidth) {
      effectiveFontSize = maxWidth / widthPerPx;
    }

    text.setAttribute("font-size", `${effectiveFontSize}px`);
    text.setAttribute("fill", mainColor);
    text.setAttribute("stroke", contrastColor);
    text.setAttribute("stroke-width", String(effectiveFontSize * 0.05));
    text.setAttribute("paint-order", "stroke");
    // Three decimals, so 0.2 * 0.8 is written as 0.16, not 0.16000000000000003
    text.setAttribute("fill-opacity", String(Math.round(textOpacity * 1000) / 1000));
    text.setAttribute("stroke-opacity", String(Math.round(textOpacity * 500) / 1000));
    text.setAttribute("pointer-events", "none");
    text.style.userSelect = "none";

    return text;
  };

  const addAt = (el, x, y, anchor, rotation = 0) => {
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("text-anchor", anchor);
    if (rotation) {
      el.setAttribute("transform", `rotate(${rotation}, ${x}, ${y})`);
    }
    svg.appendChild(el);
  };

  // 1. BACKGROUND / CENTERED LAYER (Large & Protective)
  if (style === "background" || style === "both" || pos === "center") {
    const angleRad = -30 * (Math.PI / 180);
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));

    // Calculate the maximum possible length that fits in the box at this angle
    // L_max = min(W / cos(alpha), H / sin(alpha))
    const maxLen = Math.min(d.w / cosA, d.h / sinA) * 0.9;

    const fontSize = maxLen * 0.12;
    const bgOpacity = style === "both" ? opacity * 0.6 : opacity;

    const el = createWatermarkElement(fontSize, bgOpacity, maxLen);
    const centerX = d.x + d.w / 2;
    const centerY = d.y + d.h / 2;
    el.setAttribute("dominant-baseline", "middle");
    addAt(el, centerX, centerY, "middle", -30);
  }

  // 2. CORNER / SIDES LAYER (Small & Professional)
  // With placement "margin" the marks sit in the middle of the blank margin
  // around the diagram, so they never cover a shape. The text shrinks to fit
  // that band.
  if (style === "corner" || style === "both") {
    const inMargin = placement === "margin";
    const maxDim = Math.max(d.w, d.h);
    let fontSize = maxDim * 0.025; // Always small relative to diagram
    if (inMargin) fontSize = Math.min(fontSize, pad * 0.6);
    // On a long or tall diagram that size does not fit across the short
    // side, so a corner mark left its corner and the four-sides marks ran
    // into each other. Shrink it until each mark and its inset fit, with
    // the marks on opposite sides clear of each other.
    else fontSize = Math.min(fontSize, Math.min(d.w, d.h) / (pos === "four-sides" ? 5 : 3));
    const margin = fontSize;
    const inset = inMargin ? 0 : margin;
    const sideOpacity = style === "both" ? opacity * 0.8 : opacity;

    const top = inMargin ? d.y - pad / 2 : d.y + margin + fontSize;
    const bottom = inMargin ? d.y + d.h + pad / 2 : d.y + d.h - margin;
    const place = (x, y, anchor, maxWidth, rotation) => {
      const el = createWatermarkElement(fontSize, sideOpacity, maxWidth);
      if (inMargin) el.setAttribute("dominant-baseline", "middle");
      addAt(el, x, y, anchor, rotation);
    };

    if (pos === "four-sides") {
      const left = inMargin ? d.x - pad / 2 : d.x + margin;
      const right = inMargin ? d.x + d.w + pad / 2 : d.x + d.w - margin;
      place(d.x + d.w / 2, top, "middle", d.w * 0.5);
      place(d.x + d.w / 2, bottom, "middle", d.w * 0.5);
      place(left, d.y + d.h / 2, "middle", d.h * 0.5, -90);
      place(right, d.y + d.h / 2, "middle", d.h * 0.5, 90);
    } else if (pos !== "center") {
      // Corner text lines up with the diagram's left or right edge
      const east = pos.includes("right");
      place(
        east ? d.x + d.w - inset : d.x + inset,
        pos.includes("bottom") ? bottom : top,
        east ? "end" : "start",
        d.w * 0.35, // Strict corner limit
      );
    }
  }
}

/** Sources whose export already warned about hard-to-read labels */
const warnedFaint = new WeakSet();

/**
 * Advice for labels that will be hard to read in the file. Once per viewer
 * open, as each open has a new modal clone, and once per page diagram
 * for toolbar exports.
 * @private
 * @param {SVGSVGElement|null} source - SVG the export came from, null when the labels read fine
 * @param {boolean} [silent] - Skip the warning
 * @returns {string} The advice, or "" when there is nothing to say
 */
function faintAdvice(source, silent) {
  if (!source || silent || warnedFaint.has(source)) return "";
  warnedFaint.add(source);
  // Light helps only on a background where white text reads better than black
  const { bg } = detectTheme();
  const light =
    getContrastRatio(bg, "#fff") >= getContrastRatio(bg, "#000") ? ", or pick Light," : "";
  return `Turn on Readable${light} and export again.`;
}

/**
 * Count the images an image or PDF file will lack. The browser draws the
 * SVG as an image and loads nothing it links to, so only data: images get in.
 * @private
 * @param {SVGSVGElement} svg - The copy that gets drawn
 * @returns {number} Linked <image> elements and <img> in HTML labels
 */
function countLinkedImages(svg) {
  let n = 0;
  for (const el of svg.querySelectorAll("image, img")) {
    const url = (
      el.getAttribute("href") ||
      el.getAttribute("xlink:href") ||
      el.getAttribute("src") ||
      ""
    ).trim();
    if (url && !/^data:/i.test(url)) n++;
  }
  return n;
}

/**
 * Whether the copy links an image or resource on another site. Only such a
 * link can explain a canvas the browser will not let DiagView read back.
 * @private
 * @param {SVGSVGElement} svg - The copy that gets drawn
 * @returns {boolean} True for an image, <use>, CSS url() or @import on another origin
 */
function linksOtherSite(svg) {
  const urls = [];
  for (const el of svg.querySelectorAll("image, img, use, feImage")) {
    urls.push(el.getAttribute("href") || el.getAttribute("xlink:href") || el.getAttribute("src"));
  }
  for (const el of svg.querySelectorAll("style, [style]")) {
    const css = el.localName === "style" ? el.textContent : el.getAttribute("style");
    for (const m of css.matchAll(/url\(\s*["']?([^"')\s]+)|@import\s+["']([^"']+)/gi)) {
      urls.push(m[1] || m[2]);
    }
  }
  return urls.some((url) => {
    if (!url || /^\s*data:/i.test(url)) return false;
    try {
      return new URL(url.trim(), location.href).origin !== location.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Show the saved or copied notice. Only one notice shows at a time, so a
 * warning about labels that are hard to read, or about linked images left
 * out of the file, takes its place and says the file was saved too.
 * silent skips both warnings.
 * @private
 * @param {string} message - The notice for a complete file
 * @param {object} [found] - What the export found
 * @param {number} [found.linked] - Linked images the file lacks
 * @param {SVGSVGElement|null} [found.faint] - Source whose labels are hard to read
 * @param {boolean} [found.silent] - Skip the warnings
 * @param {string} [found.kind] - What the file is, for the linked images warning
 * @param {boolean} [found.warn] - Show the plain notice as a warning
 */
function showSaved(
  message,
  { linked = 0, faint = null, silent = false, kind = "image", warn = false } = {},
) {
  const advice = faintAdvice(faint, silent);
  if (linked && !silent) {
    const images = linked === 1 ? "1 linked image was" : `${linked} linked images were`;
    const done = `${message.replace(/!$/, "")}, but ${images} left out`;
    return showWarningToast(
      advice
        ? `${done} and some labels are hard to read on this background. ${advice}`
        : `${done}. Only embedded images can go into ${kind} files.`,
    );
  }
  if (advice) {
    return showWarningToast(
      `${message.replace(/!$/, "")}, but some labels are hard to read on this background. ${advice}`,
    );
  }
  (warn ? showWarningToast : showSuccessToast)(message);
}

/**
 * Prepare SVG for export.
 *  1. Clone from the modal clone when one is given (the floating menu always
 *     passes it) so the export matches what the user sees; fall back to the
 *     original page SVG otherwise
 *  2. Set explicit px dimensions, never "100%" (avoids intrinsic-size=0 in <img>)
 *  3. Wait for fonts → embed them → consistent text metrics
 * @private
 * @param {SVGSVGElement} svg - Original page SVG
 * @param {SVGSVGElement|null} modalClone - Modal clone, preferred as the source when present
 * @param {boolean} [transparent] - The file has no background
 * @param {boolean} [silent] - No warnings, so no check for hard-to-read labels
 */
async function prepareSvgForExport(svg, modalClone, transparent, silent) {
  const theme = detectTheme();
  const bg = transparent ? null : theme.bg;

  // Wait for fonts to load so BBox / computed styles are stable
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Use modalClone for dimensions and content if available to ensure fidelity
  const sourceSvg = modalClone || svg;
  const d = getRobustDimensions(sourceSvg);

  const zoomCushion = Math.max(d.w, d.h) * 0.05;
  const padding = Math.max(EXPORT.SVG_EXPORT_PADDING / 2, zoomCushion);

  // The file is a whole number of pixels, so the view grows to match on
  // each side. A fractional view in a rounded size left a sliver along one
  // edge outside the background.
  const width = Math.ceil(d.w + padding * 2);
  const height = Math.ceil(d.h + padding * 2);
  const vx = d.x - (width - d.w) / 2;
  const vy = d.y - (height - d.h) / 2;

  // CRITICAL FIX: Use sourceSvg (modalClone if in fullscreen)
  // With Readable on, a file with a background gets the colours Readable
  // picks for that background. A transparent file keeps the author's
  // colours, as light text would vanish on a white page. The clone reads
  // styles and copies the DOM before its first await, so the view's own
  // recolours are off for both.
  // With exportSearchHighlight off, the search class comes off while the
  // clone reads styles, so the file has no dimming or outline. The on-screen
  // search is put back before anything can repaint.
  // With Readable off, the same check finds labels straight on the
  // background that will be hard to read in the file. A silent export shows
  // no warning, so it skips the check.
  let hideSearch = false;
  let faint = false;
  const cloneSource = (paint) => {
    hideSearch =
      !state.config.exportSearchHighlight && sourceSvg.classList?.contains("dv-searching");
    if (hideSearch) sourceSvg.classList.remove("dv-searching");
    try {
      return cloneSVGForExportAsync(sourceSvg, paint);
    } finally {
      if (hideSearch) sourceSvg.classList.add("dv-searching");
    }
  };
  // The readable text chunk is needed to recolour labels with Readable on,
  // to find faint labels for the warning a silent export never shows, or
  // to put back labels Readable has changed on the page
  const recolour = bg && state.readableText;
  const checkFaint = bg && !silent;
  const restoreLabels = sourceSvg.querySelector?.("[data-dv-text-orig]");
  const exportSvg = await (recolour || checkFaint || restoreLabels
    ? loadChunk("readable text", () => import("./lazy/readable-text.js")).then((m) => {
        const made = m.exportText(sourceSvg, bg, cloneSource);
        faint = made.faint;
        return made.clone;
      })
    : cloneSource(null));

  if (!exportSvg) return null;

  if (hideSearch) {
    for (const el of exportSvg.querySelectorAll(".dv-search-match, .dv-search-current")) {
      el.classList.remove("dv-search-match", "dv-search-current");
      if (!el.classList.length) el.removeAttribute("class");
    }
  }

  // Embed fonts so text metrics match the original browser render
  const { mode, allowRemoteResources } = exportSecurity(sourceSvg);
  await embedDocumentFonts(
    exportSvg,
    state.config.exportFonts,
    mode === "strict" && !allowRemoteResources,
  );

  // Set explicit dimensions as ATTRIBUTES (not CSS — CSS "100%" breaks img intrinsic size)
  exportSvg.setAttribute("viewBox", `${vx} ${vy} ${width} ${height}`);
  exportSvg.setAttribute("width", String(width));
  exportSvg.setAttribute("height", String(height));
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // CRITICAL FIX: clear ALL inline styles on the root element.
  // The original code set style.width="100%" which overrides the width attribute
  // when loaded as <img>, causing the SVG to have no intrinsic size → clipping.
  exportSvg.style.cssText = "";
  exportSvg.removeAttribute("transform");

  // Inject watermark if enabled (Silent Branding)
  injectWatermark(exportSvg, d, svg, padding);

  return { width, height, bg: theme.bg, svg: exportSvg, faint: faint ? sourceSvg : null };
}

/**
 * Helper to serialize SVG to string asynchronously to avoid UI blocking
 * @private
 */
async function serializeSVGAsync(svgEl) {
  return new Promise((resolve, reject) => {
    // A throw inside the callback would never reach the promise, so reject
    // here or the export waits forever
    const serialize = () => {
      try {
        resolve(new XMLSerializer().serializeToString(svgEl));
      } catch (e) {
        reject(e);
      }
    };
    // Use MessageChannel to yield to the event loop before heavy serialization
    // This ensures UI updates (like toasts) are rendered before the CPU spike
    if (typeof MessageChannel !== "undefined") {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => {
        port1.close();
        serialize();
      };
      port2.postMessage(null);
    } else {
      // Fallback for environments without MessageChannel (like Node/JSDOM tests)
      setTimeout(serialize, 0);
    }
  });
}

/**
 * data-diagview-scale for an export, which overrides the global highResScale.
 * The element passed in comes first, or the diagram open in the viewer when
 * that is not an element. Then the diagram around the SVG, so the attribute
 * also counts on the container of an exported <svg> and on the outer element
 * of a nested match.
 * @private
 * @param {HTMLElement|SVGSVGElement} sourceElement - Element passed to the export
 * @param {SVGSVGElement} svg - The diagram's SVG
 * @returns {string|undefined} The attribute value, or undefined when none is set
 */
function scaleAttribute(sourceElement, svg) {
  let diagram = null;
  try {
    diagram = svg.closest(state.config.diagramSelector);
  } catch (_e) {
    // A selector the browser rejects matches nothing
  }
  const holders = [
    sourceElement?.dataset ? sourceElement : state.activeSourceElement,
    svg.closest("[data-diagview-init]"),
    diagram,
  ];
  return holders.find((el) => el?.dataset?.diagviewScale != null)?.dataset.diagviewScale;
}

/** Longest canvas side an export draws, in pixels */
const MAX_CANVAS_SIDE = 16383;

/**
 * Render to canvas.
 * Uses the modal clone as the source when one is provided (fullscreen
 * exports), otherwise the original SVG inside sourceElement.
 * @param {HTMLElement} sourceElement - Element containing the SVG
 * @param {SVGSVGElement|null} modalClone - Modal clone to render from, if open
 * @param {boolean} [transparent=false] - Skip the background fill
 * @param {boolean} [opaque=false] - The format has no transparency (JPEG, PDF)
 * @param {boolean} [silent=false] - Skip the check for hard-to-read labels
 */
export async function renderToCanvas(
  sourceElement,
  modalClone,
  transparent = false,
  opaque = false,
  silent = false,
) {
  const originalSvg = getDiagramSvg(sourceElement);
  if (!originalSvg) throw new Error("No SVG found");

  const style = window.getComputedStyle(originalSvg);
  if (style.display === "none") {
    console.warn("DiagView: Exporting a hidden element may result in empty styles.");
  }

  // Use modalClone if available to ensure export matches browser rendering
  const result = await prepareSvgForExport(originalSvg, modalClone, transparent, silent);
  if (!result) {
    // Only the size limit gets here, and cloneSVG has already said so
    const err = new Error("SVG preparation failed");
    err.dvReported = true;
    throw err;
  }

  const { width, height, bg, svg: finalSvg, faint } = result;

  const isMobile = isMobileDevice();

  const elementScale = parseInt(scaleAttribute(sourceElement, originalSvg) ?? "", 10);
  const highResScale =
    elementScale >= 1 && elementScale <= 10 ? elementScale : state.config.highResScale;

  let scale = isMobile
    ? state.config.mobileScale || EXPORT.MOBILE_SCALE_DEFAULT
    : highResScale || EXPORT.HIGH_RES_SCALE_DEFAULT;

  // maxPixels caps the area. Firefox also refuses a canvas side over 32767
  // pixels, so with a raised maxPixels a long, flat diagram failed to
  // export. Each side stays at or under 16383 pixels, the WebP limit.
  const fit = Math.min(
    Math.sqrt(state.config.maxPixels / (width * height)),
    MAX_CANVAS_SIDE / Math.max(width, height),
  );
  if (scale > fit) {
    scale = fit;
    console.warn(`DiagView: Auto-scaled to ${scale.toFixed(2)}x for safety`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  const svgStr = await serializeSVGAsync(finalSvg);

  // A data: URL first. Chrome taints the canvas when it draws a blob: SVG
  // that contains <foreignObject>, and Mermaid puts every label in one.
  // Some Firefox versions refuse data: URLs over 32 MB, so if the data: URL
  // fails to load, try a blob: URL before giving up.
  const img = new Image();
  img.crossOrigin = "anonymous";

  // Set explicit dimensions on the img element to guarantee correct natural size
  img.width = width;
  img.height = height;

  const load = (src) =>
    new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = src;
    });

  let blobUrl = null;
  try {
    await load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr));
  } catch (_e) {
    blobUrl = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    try {
      await load(blobUrl);
    } catch (_e2) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Image load failed. SVG may be too large or contain invalid data.");
    }
  }

  if (!transparent) {
    // JPEG and PDF drop the alpha, so a see-through colour such as
    // "transparent" would come out black. They get the colour the viewer
    // shows, the page under the canvas colour.
    ctx.fillStyle = (opaque ? detectTheme().seenBg : bg) || COLORS.BG_LIGHT;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (blobUrl) URL.revokeObjectURL(blobUrl);

  return {
    canvas,
    scale,
    width,
    height,
    faint,
    linked: countLinkedImages(finalSvg),
    foreign: linksOtherSite(finalSvg),
  };
}

/**
 * Export as SVG
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToSVG(sourceElement, options = {}) {
  const svg = resolveSourceSvg(sourceElement);
  if (svg) await saveSVG(svg, options.filename || generateFilename(svg, sourceElement), options);
}

/**
 * The internal export paths resolve to true once the user has the file and
 * to undefined after a failure, so exportDiagram() knows to fire onExport.
 * @private
 */
async function saveSVG(originalSvg, filename, { transparent: isTransparent, modalClone, silent }) {
  try {
    const prepared = await prepareSvgForExport(originalSvg, modalClone, isTransparent, silent);
    // Over the size limit. cloneSVG has already shown "Diagram blocked".
    if (!prepared) return;
    const { bg, svg } = prepared;

    // Add bg rect for non-transparent SVG
    if (!isTransparent) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      // prepareSvgForExport always sets the viewBox
      const vbParts = svg.getAttribute("viewBox").split(" ").map(parseFloat);
      rect.setAttribute("x", vbParts[0] || 0);
      rect.setAttribute("y", vbParts[1] || 0);
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", "100%");
      rect.setAttribute("fill", bg);
      svg.insertBefore(rect, svg.firstChild);
    }

    downloadSVG(await serializeSVGAsync(svg), filename);
    showSaved("SVG saved", { faint: prepared.faint, silent });
    return true;
  } catch (e) {
    showErrorToast("SVG Failed", e.message);
  }
}

/**
 * Download SVG markup as a .svg file
 * @private
 */
function downloadSVG(data, filename) {
  // Use DataURL for small SVGs to ensure filename compatibility on file://
  const isSmall = data.length < EXPORT.LARGE_FILE_THRESHOLD;
  const downloadUrl = isSmall
    ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data)
    : URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));

  downloadFile(downloadUrl, `${filename}.svg`);
}

/**
 * Copy raw SVG vector markup directly to clipboard. When the clipboard is
 * unavailable or denies the write, the markup downloads as a .svg file.
 * Safari copies only during a click, so call it from the click handler
 * before any await of your own.
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename and modalClone. filename names the
 *   download used when the clipboard is unavailable.
 * @returns {Promise<boolean|undefined>} True once the markup is copied or downloaded
 */
export async function copySVGCode(sourceElement, options = {}) {
  const originalSvg = getDiagramSvg(sourceElement);
  if (!originalSvg) return showErrorToast("No SVG found");
  // Started before the first await, as Copy Image does
  const clip = startCopy("text/plain");

  try {
    // The markup has no background, so it keeps the author's colours like
    // a transparent file
    const prepared = await prepareSvgForExport(originalSvg, options.modalClone, true);
    // Over the size limit. cloneSVG has already shown "Diagram blocked".
    if (!prepared) return;
    const data = await serializeSVGAsync(prepared.svg);

    let copied;
    if (clip) {
      copied = await finishCopy(clip, "text/plain", new Blob([data], { type: "text/plain" }));
    } else if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(data);
        copied = true;
      } catch (err) {
        // Firefox and Safari deny the write once the click is too far back
        if (err?.name !== "NotAllowedError") throw err;
      }
    } else {
      const input = document.createElement("textarea");
      input.value = data;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      // Returns false when the browser refuses to copy
      copied = document.execCommand?.("copy");
      input.remove();
    }
    if (copied) {
      showSuccessToast("SVG Code copied to clipboard!");
    } else {
      downloadSVG(data, options.filename || generateFilename(originalSvg, sourceElement));
      showSuccessToast("SVG downloaded (Clipboard unavailable)");
    }
    return true;
  } catch (e) {
    showErrorToast("Copy SVG Failed", e.message);
  } finally {
    // Nothing goes on the clipboard unless the markup was handed over
    clip?.give(null);
  }
}

/**
 * Start a clipboard write for an image or markup that is not ready yet.
 * Safari and Firefox let a page write to the clipboard only during the
 * click that asked for it, and making the file takes longer than that. So
 * the write starts at once with a promise of the file, and the browser
 * waits for it. Call it before the first await of the click.
 * @private
 * @param {string} mime - Type of the file
 * @returns {{give: Function, done: Promise<{ok: boolean, error?: *}>|null}|null}
 *   null when the clipboard cannot take it. give(blob) hands over the
 *   file, and give(null, error) says it failed. done settles once the
 *   write ends, and is null where ClipboardItem takes only a finished Blob
 *   (Chrome before 98).
 */
function startCopy(mime) {
  if (!isClipboardAvailable()) return null;
  let give;
  const file = new Promise((resolve, reject) => {
    give = (blob, error) => (blob ? resolve(blob) : reject(error));
  });
  // A browser that never takes the promise must not report it as unhandled
  file.catch(() => {});
  let done = null;
  try {
    done = navigator.clipboard.write([new ClipboardItem({ [mime]: file })]).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );
  } catch (_e) {
    // ClipboardItem refused the promise, so the finished Blob goes in later
  }
  return { give, done };
}

/**
 * Hand the finished file to a write that startCopy() began. Resolves to
 * true once copied and to false when the browser denies the write. Any
 * other failure of the early write, or a browser that refused the promise,
 * gets one more try with the finished file, which throws if that fails too.
 * @private
 */
async function finishCopy(clip, mime, blob) {
  clip.give(blob);
  const early = clip.done && (await clip.done);
  if (early?.ok) return true;
  if (early?.error?.name === "NotAllowedError") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
    return true;
  } catch (err) {
    if (err?.name !== "NotAllowedError") throw err;
    return false;
  }
}

/**
 * Internal Image Export Processor. Resolves to the extension of the file
 * made ("png", "jpeg" or "webp") once the image is saved, copied, or
 * downloaded because the clipboard was unavailable.
 */
async function processImageExport(
  sourceElement,
  filename,
  format,
  transparent,
  copy,
  modalClone,
  silent = false,
) {
  // Set once the copy is drawn, for the notice if reading it back fails
  let foreign = false;
  // The clipboard write for Copy Image, started before the first await
  let clip = null;
  try {
    const isWebP = format === "webp";
    const isJpeg = format === "jpeg";

    // Determine mime type and extension
    let mime = "image/png";
    let ext = "png";

    if (isWebP) {
      mime = "image/webp";
      ext = "webp";
    } else if (isJpeg) {
      mime = "image/jpeg";
      ext = "jpeg";
    }

    let label = (transparent ? "Transparent " : "") + (isWebP ? "WebP" : isJpeg ? "JPEG" : "PNG");

    // JPEG doesn't support transparency, auto-switch to PNG for better UX
    if (isJpeg && transparent) {
      label = "Transparent PNG";
      mime = "image/png";
      ext = "png";
      if (!silent) {
        showWarningToast("JPEGs don't support transparency. Switched to Transparent PNG for you.");
      }
    } else if (!silent) {
      showProgressToast(`Processing ${label}...`);
    }

    if (copy) clip = startCopy(mime);

    // Small delay to ensure toast renders before heavy canvas work
    await new Promise((resolve) => setTimeout(resolve, TIMING.RENDER_DELAY));

    let canvasRef = null;
    try {
      const drawn = await renderToCanvas(sourceElement, modalClone, transparent, isJpeg, silent);
      const { canvas, scale, faint, linked } = drawn;
      canvasRef = canvas;
      foreign = drawn.foreign;
      const found = { linked, faint, silent };

      const quality = isWebP ? 0.95 : undefined;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
          mime,
          quality,
        );
      });
      // Safari cannot make WebP and hands back a PNG, so the file is named
      // and announced as what the browser made
      const noWebP = isWebP && blob.type === "image/png";
      if (noWebP) {
        ext = "png";
        label = label.replace("WebP", "PNG");
      }

      if (copy) {
        // Fallback when the clipboard cannot be used: hand the file over as a download
        const downloadInstead = () => {
          const url = URL.createObjectURL(blob);
          downloadFile(url, `${filename}.${ext}`);
          setTimeout(() => URL.revokeObjectURL(url), TIMING.CLEANUP_DELAY);
          showSaved(`${label} downloaded (Clipboard unavailable)`, found);
        };

        // A denied write gets the download
        if (clip && (await finishCopy(clip, mime, blob))) showSaved("Copied to clipboard!", found);
        else downloadInstead();
      } else {
        // Download: Use BlobURL for maximum stability
        const downloadUrl = URL.createObjectURL(blob);
        downloadFile(downloadUrl, `${filename}.${ext}`);
        // Revoke after a short delay to ensure browser has started the download
        setTimeout(() => URL.revokeObjectURL(downloadUrl), TIMING.BUTTON_SUCCESS_DURATION);
        const made = `${scale.toFixed(1)}x ${label}`;
        found.warn = noWebP;
        showSaved(
          noWebP ? `This browser cannot make WebP, so it saved a ${made}` : `${made} saved`,
          found,
        );
      }
      return ext;
    } finally {
      // DOM-4: Release canvas memory immediately
      if (canvasRef) {
        canvasRef.width = 0;
        canvasRef.height = 0;
      }
    }
  } catch (e) {
    // Nothing goes on the clipboard
    clip?.give(null, e);
    if (e?.dvReported) return;
    console.error("DiagView Export Error:", e);

    // A canvas the browser will not read back. Blame another site only when
    // the copy links to one. Chrome and Safari also refuse a canvas drawn
    // from the blob: fallback when it has HTML labels.
    if (foreign && (e.name === "SecurityError" || e.message?.includes("tainted"))) {
      showErrorToast(
        "Export blocked by cross-origin image",
        "An image or resource from another site blocked canvas export. " +
          "Use SVG export instead, or ensure external images have CORS headers (Access-Control-Allow-Origin: *).",
      );
    } else {
      showErrorToast("Export Failed", e.message);
    }
  }
}

/**
 * Export as PNG
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToPNG(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg, sourceElement);
  await processImageExport(
    sourceElement,
    filename,
    "png",
    !!options.transparent,
    false,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Export as JPEG
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToJPEG(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg, sourceElement);
  await processImageExport(
    sourceElement,
    filename,
    "jpeg",
    !!options.transparent,
    false,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Export as WebP
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToWebP(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg, sourceElement);
  await processImageExport(
    sourceElement,
    filename,
    "webp",
    !!options.transparent,
    false,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Copy to Clipboard (PNG). Safari and Firefox copy only during a click, so
 * call it from the click handler before any await of your own.
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, silent and modalClone. filename names
 *   the download used when the clipboard is unavailable.
 * @returns {Promise<void>} Resolves when the image is copied or downloaded
 */
export async function copyToClipboard(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg, sourceElement);
  await processImageExport(
    sourceElement,
    filename,
    "png",
    false,
    true,
    options.modalClone,
    !!options.silent,
  );
}

/**
 * Export as PDF
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone.
 *   PDF has no transparency, so transparent only shows a warning.
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToPDF(sourceElement, options = {}) {
  const svg = resolveSourceSvg(sourceElement);
  if (svg)
    await savePDF(sourceElement, options.filename || generateFilename(svg, sourceElement), options);
}

/**
 * Resolves to true once the PDF is saved. The PNG fallback resolves to
 * undefined because no PDF was made.
 * @private
 */
async function savePDF(sourceElement, filename, { transparent, modalClone, silent }) {
  try {
    showProgressToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    if (!window.jspdf) {
      await loadScript(pdfUrl, state.config.pdfLibraryIntegrity).catch(() => {
        // Silently handle load failure, the check below will trigger the fallback UI
      });
    }

    // Fallback: If no jsPDF, save as PNG
    if (!window.jspdf) {
      showWarningToast("PDF engine unavailable, falling back to PNG...");
      await exportToPNG(sourceElement, { filename, modalClone, silent: true });
      return;
    }

    if (transparent) {
      showWarningToast("PDF format does not support transparency. Using background color.");
    }

    const { canvas, width, height, faint, linked } = await renderToCanvas(
      sourceElement,
      modalClone,
      false,
      true,
      silent,
    );
    let imgData;
    try {
      imgData = canvas.toDataURL("image/png");
    } finally {
      // Release the canvas memory, as the image exports do
      canvas.width = 0;
      canvas.height = 0;
    }

    // jsPDF caps a page side at 14400 pt, and its px unit is 96/72 pt, so
    // a side over 10800 px would lose its far end. Shrink the page and the
    // image together to fit.
    const fit = Math.min(1, 10800 / Math.max(width, height));
    const w = width * fit;
    const h = height * fit;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF(w > h ? "l" : "p", "px", [w, h]);
    pdf.addImage(imgData, "PNG", 0, 0, w, h, undefined, "FAST");
    pdf.save(`${filename}.pdf`);
    showSaved("PDF saved", { linked, faint, silent, kind: "PDF" });
    return true;
  } catch (e) {
    if (!e?.dvReported) showErrorToast("PDF Failed", e.message);
  }
}

/**
 * Main Export Handler
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportMode} mode - Export format. An unknown mode exports PNG.
 * @param {ExportOptions|SVGSVGElement|null} [options={}] - Reads filename, transparent,
 *   silent and modalClone. silent hides the progress and JPEG notices for png, jpeg, webp
 *   and copy, and the hard-to-read labels and linked images warnings for every mode. An
 *   SVG element here is the old third argument and works as modalClone.
 * @returns {Promise<boolean>} Resolves to true once the file is saved or copied, or downloaded
 *   because the clipboard was unavailable, after the onExport callback. Resolves to false
 *   when the export failed or was blocked, or a PDF fell back to PNG.
 */
export async function exportDiagram(sourceElement, mode, options = {}) {
  // A null third argument means no options
  options = options || {};

  // Support legacy signature (element, mode, modalClone)
  if ((options && typeof options !== "object") || options?.nodeType === 1) {
    options = { modalClone: options };
  }

  const modalClone = options.modalClone || null;
  let isTransparent = options.transparent || false;

  const svg = getDiagramSvg(sourceElement);
  if (!svg) {
    showErrorToast("No diagram found");
    return false;
  }

  const filename = options.filename || generateFilename(svg, sourceElement);
  const silent = options.silent;

  // Parse legacy modes mapping
  if (mode === "png-transparent") {
    mode = "png";
    isTransparent = true;
  }
  if (mode === "webp-transparent") {
    mode = "webp";
    isTransparent = true;
  }
  if (mode === "download") {
    mode = "png";
  }

  const opts = { transparent: isTransparent, modalClone, silent };
  let ok;
  // What onExport reports. Image exports replace it with the format of the file made.
  let format = mode;
  switch (mode) {
    case "svg":
      ok = await saveSVG(svg, filename, opts);
      break;
    case "copy-svg":
      ok = await copySVGCode(sourceElement, { filename, modalClone });
      break;
    case "copy":
      ok = await processImageExport(
        sourceElement,
        filename,
        "png",
        false,
        true,
        modalClone,
        silent,
      );
      break;
    case "pdf":
      ok = await savePDF(sourceElement, filename, opts);
      break;
    default: {
      // Unknown modes export an opaque PNG
      const known = /^(png|jpeg|webp)$/.test(mode);
      format = await processImageExport(
        sourceElement,
        filename,
        known ? mode : "png",
        known && isTransparent,
        false,
        modalClone,
        silent,
      );
      ok = !!format;
    }
  }

  // Fire onExport only when the user got the file (matches onOpen/onClose pattern)
  if (ok && state.config.onExport) {
    try {
      state.config.onExport(format, filename);
    } catch (e) {
      console.error("DiagView: onExport callback error:", e);
    }
  }
  return !!ok;
}
