/**
 * DiagView Export Functionality - REFINED
 * Uses robust sizing logic to fix low-res exports
 * @module features/export
 */

import { state } from "../core/config.js";
import { EXPORT, COLORS, TIMING } from "../core/constants.js";
import { detectTheme } from "../core/theme.js";
import {
  downloadFile,
  sanitizeFilename,
  getTimestamp,
  isMobileDevice,
  isClipboardAvailable,
  loadScript,
  getRobustDimensions,
} from "../core/utils.js";
import { cloneSVGForExportAsync } from "../core/svg-clone.js";
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from "../ui/toast.js";

/**
 * Export format for exportDiagram(). "download" is the same as "png", and the
 * "-transparent" modes skip the background fill.
 * @typedef {"png"|"svg"|"jpeg"|"webp"|"pdf"|"copy"|"copy-svg"|"png-transparent"|"webp-transparent"|"download"} ExportMode
 */

/**
 * Options for the export functions. Each function documents which fields it reads.
 * @typedef {object} ExportOptions
 * @property {string} [filename] - File name without extension, generated from the diagram title if empty
 * @property {boolean} [silent] - Skip the processing toast and the JPEG transparency warning
 * @property {boolean} [transparent] - Skip the background fill
 * @property {SVGSVGElement|null} [modalClone] - Fullscreen clone to export instead of the original SVG
 */

/**
 * Generate filename
 */
export function generateFilename(svg) {
  const titleEl = svg.querySelector("title, text.title, text.titleText, text.diagview-title");
  let rawTitle = titleEl ? titleEl.textContent : "";

  if (!rawTitle) {
    const wrapper = svg.closest(".diagview-wrapper");
    const label = wrapper?.querySelector(".diagview-label");
    rawTitle = label ? label.textContent : "diagram";
  }

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
  const svg = sourceElement?.querySelector?.("svg") ?? null;
  if (!svg) showErrorToast("No diagram found");
  return svg;
}

/**
 * Fetch a URL and return a base64 data URI, or null on failure.
 * Used to embed fonts so export SVGs render consistently.
 * @private
 */
async function fetchAsDataURI(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(url, { mode: "cors", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => res(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Collect @font-face rules from loaded document stylesheets
 * and embed referenced font files as base64 data URIs.
 * Mutates the SVG element's first/new <style> block.
 * @private
 */
async function embedDocumentFonts(svgEl) {
  if (typeof document === "undefined" || !document.fonts) return;

  // Wait for all fonts to be loaded before reading metrics / before export
  await document.fonts.ready;

  const fontFaceRules = [];
  for (const sheet of document.styleSheets) {
    try {
      // Relative url()s inside a rule resolve against the stylesheet that
      // declares it (or the page for inline <style> blocks), not the export.
      const base = sheet.href || document.baseURI;
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          fontFaceRules.push({ cssText: rule.cssText, base });
        }
      }
    } catch {
      // cross-origin stylesheets — skip
    }
  }

  if (!fontFaceRules.length) return;

  // Fetch and inline font files referenced by url(...)
  const inlined = await Promise.all(
    fontFaceRules.map(async ({ cssText, base }) => {
      // Replace each url(...) with a base64 data URI. Relative and
      // root-relative references (self-hosted fonts) are made absolute
      // first: copied verbatim they cannot resolve inside a data:/blob: image.
      const urlMatches = [...cssText.matchAll(/url\((['"]?)([^'")\s]+)\1\)/gi)];
      let result = cssText;
      for (const [match, , rawUrl] of urlMatches) {
        if (/^data:/i.test(rawUrl)) continue;
        let absolute;
        try {
          absolute = new URL(rawUrl, base).href;
        } catch {
          continue;
        }
        const dataURI = await fetchAsDataURI(absolute);
        if (dataURI) {
          result = result.replace(match, `url('${dataURI}')`);
        }
      }
      return result;
    }),
  );

  // Prepend a <style> with embedded @font-face rules to the SVG
  let styleEl = svgEl.querySelector("style.dv-font-embed");
  if (!styleEl) {
    styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.classList.add("dv-font-embed");
    svgEl.insertBefore(styleEl, svgEl.firstChild);
  }
  styleEl.textContent = inlined.join("\n");
}

const WATERMARK_STYLES = ["corner", "background", "both"];
const WATERMARK_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
  "four-sides",
];

/**
 * Resolve the watermark style, position and opacity. An unknown style or
 * position logs a warning and uses the default, so a typo still gives a
 * watermark. An opacity outside 0 to 1 is clamped into that range, and one
 * that is not a number uses 0.2. A missing or empty value uses the default
 * without a warning.
 * @private
 */
function resolveWatermark(config) {
  let style = String(config.style || "corner")
    .trim()
    .toLowerCase();
  if (!WATERMARK_STYLES.includes(style)) {
    console.warn(
      `DiagView: Unknown watermark style "${config.style}", expected corner, background or both. Using corner.`,
    );
    style = "corner";
  }

  let pos = String(config.position || "bottom-right")
    .trim()
    .toLowerCase();
  if (!WATERMARK_POSITIONS.includes(pos)) {
    console.warn(
      `DiagView: Unknown watermark position "${config.position}", expected ${WATERMARK_POSITIONS.join(", ")}. Using bottom-right.`,
    );
    pos = "bottom-right";
  }

  const isEmpty =
    config.opacity == null || (typeof config.opacity === "string" && config.opacity.trim() === "");
  let opacity = isEmpty ? 0.2 : config.opacity;
  const isNumeric =
    (typeof opacity === "number" && !isNaN(opacity)) ||
    (typeof opacity === "string" && opacity.trim() !== "" && !isNaN(Number(opacity)));
  if (!isNumeric) {
    console.warn(
      `DiagView: Watermark opacity "${opacity}" should be a number from 0 to 1. Using 0.2.`,
    );
    opacity = 0.2;
  } else if (Number(opacity) < 0 || Number(opacity) > 1) {
    const clamped = Math.min(1, Math.max(0, Number(opacity)));
    console.warn(
      `DiagView: Watermark opacity "${opacity}" should be a number from 0 to 1. Using ${clamped}.`,
    );
    opacity = clamped;
  } else {
    opacity = Number(opacity);
  }

  return { style, pos, opacity };
}

/**
 * Injects a watermark into the SVG for branding during export.
 * Supports "background" (centered/rotated) and "corner" styles.
 * @private
 */
function injectWatermark(svg, d, sourceSvg = null) {
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
    if (dataset.diagviewWatermarkOpacity) {
      const raw = dataset.diagviewWatermarkOpacity.trim();
      const n = Number(raw);
      if (raw !== "" && !isNaN(n)) {
        config.opacity = n;
      } else if (raw !== "") {
        console.warn(
          `DiagView: data-diagview-watermark-opacity "${raw}" should be a number from 0 to 1. Using the config opacity.`,
        );
      }
    }
  }

  // Final validation before processing
  if (!config || !config.enabled || !config.text || !d || d.w <= 0 || d.h <= 0) return;

  // Detect theme for contrasting color
  const theme = detectTheme();
  const mainColor = theme.isDark ? "#ffffff" : "#000000";
  const contrastColor = theme.isDark ? "#000000" : "#ffffff";

  const { style, pos, opacity } = resolveWatermark(config);

  const createWatermarkElement = (fontSize, textOpacity, maxWidth = 0) => {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = config.text;
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");

    // Safe-Fit Scaling: Automatically fit text to available width without distortion
    let effectiveFontSize = fontSize;
    if (maxWidth > 0) {
      const charWidthRatio = 0.6; // Average for bold sans-serif
      const estimatedWidth = config.text.length * (fontSize * charWidthRatio);
      if (estimatedWidth > maxWidth) {
        effectiveFontSize = maxWidth / config.text.length / charWidthRatio;
      }
    }

    text.setAttribute("font-size", `${effectiveFontSize}px`);
    text.setAttribute("fill", mainColor);
    text.setAttribute("stroke", contrastColor);
    text.setAttribute("stroke-width", String(effectiveFontSize * 0.05));
    text.setAttribute("paint-order", "stroke");
    text.setAttribute("fill-opacity", String(textOpacity));
    text.setAttribute("stroke-opacity", String(textOpacity * 0.5));
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
  if (style === "corner" || style === "both") {
    const maxDim = Math.max(d.w, d.h);
    const fontSize = maxDim * 0.025; // Always small relative to diagram
    const margin = fontSize;
    const sideOpacity = style === "both" ? opacity * 0.8 : opacity;

    if (pos === "four-sides") {
      const sides = [
        { x: d.x + d.w / 2, y: d.y + margin + fontSize, anchor: "middle", max: d.w * 0.5 },
        { x: d.x + d.w / 2, y: d.y + d.h - margin, anchor: "middle", max: d.w * 0.5 },
        { x: d.x + margin, y: d.y + d.h / 2, anchor: "middle", rot: -90, max: d.h * 0.5 },
        { x: d.x + d.w - margin, y: d.y + d.h / 2, anchor: "middle", rot: 90, max: d.h * 0.5 },
      ];

      sides.forEach((p) => {
        const el = createWatermarkElement(fontSize, sideOpacity, p.max);
        addAt(el, p.x, p.y, p.anchor, p.rot);
      });
    } else if (pos !== "center") {
      const cornerMaxWidth = d.w * 0.35; // Strict corner limit
      const el = createWatermarkElement(fontSize, sideOpacity, cornerMaxWidth);

      let x, y, anchor;
      if (pos.includes("right")) {
        x = d.x + d.w - margin;
        anchor = "end";
      } else {
        x = d.x + margin;
        anchor = "start";
      }

      if (pos.includes("bottom")) {
        y = d.y + d.h - margin;
      } else {
        y = d.y + margin + fontSize;
      }
      addAt(el, x, y, anchor);
    }
  }
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
 */
async function prepareSvgForExport(svg, modalClone) {
  const theme = detectTheme();

  // Wait for fonts to load so BBox / computed styles are stable
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  // Use modalClone for dimensions and content if available to ensure fidelity
  const sourceSvg = modalClone || svg;
  const d = getRobustDimensions(sourceSvg);

  const zoomCushion = Math.max(d.w, d.h) * 0.05;
  const padding = Math.max(EXPORT.SVG_EXPORT_PADDING / 2, zoomCushion);

  const vx = d.x - padding;
  const vy = d.y - padding;
  const vw = d.w + padding * 2;
  const vh = d.h + padding * 2;
  const width = vw;
  const height = vh;

  // CRITICAL FIX: Use sourceSvg (modalClone if in fullscreen)
  // Readable text only changes the view; exports keep the author's colours.
  // The clone reads styles and copies the DOM before its first await, so
  // the original colours are in place for both.
  const exportSvg = await (sourceSvg.querySelector?.("[data-dv-text-orig]")
    ? import("./lazy/readable-text.js").then((m) =>
        m.withOriginalText(sourceSvg, () => cloneSVGForExportAsync(sourceSvg)),
      )
    : cloneSVGForExportAsync(sourceSvg));

  if (!exportSvg) return null;

  // Embed fonts so text metrics match the original browser render
  await embedDocumentFonts(exportSvg);

  // Set explicit dimensions as ATTRIBUTES (not CSS — CSS "100%" breaks img intrinsic size)
  exportSvg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  exportSvg.setAttribute("width", String(Math.round(width)));
  exportSvg.setAttribute("height", String(Math.round(height)));
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // CRITICAL FIX: clear ALL inline styles on the root element.
  // The original code set style.width="100%" which overrides the width attribute
  // when loaded as <img>, causing the SVG to have no intrinsic size → clipping.
  exportSvg.style.cssText = "";
  exportSvg.removeAttribute("transform");

  // Fix cross-origin images inside the SVG
  exportSvg.querySelectorAll("image").forEach((img) => {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (/^https?:\/\//.test(href)) img.setAttribute("crossorigin", "anonymous");
  });

  // Inject watermark if enabled (Silent Branding)
  injectWatermark(exportSvg, d, svg);

  return { width, height, bg: theme.bg, svg: exportSvg };
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
 * Render to canvas.
 * Uses the modal clone as the source when one is provided (fullscreen
 * exports), otherwise the original SVG inside sourceElement.
 * @param {HTMLElement} sourceElement - Element containing the SVG
 * @param {SVGSVGElement|null} modalClone - Modal clone to render from, if open
 * @param {boolean} [transparent=false] - Skip the background fill
 */
export async function renderToCanvas(sourceElement, modalClone, transparent = false) {
  const originalSvg = sourceElement.querySelector("svg");
  if (!originalSvg) throw new Error("No SVG found");

  const style = window.getComputedStyle(originalSvg);
  if (style.display === "none") {
    console.warn("DiagView: Exporting a hidden element may result in empty styles.");
  }

  // Use modalClone if available to ensure export matches browser rendering
  const result = await prepareSvgForExport(originalSvg, modalClone);
  if (!result) {
    // Only the size limit gets here, and cloneSVG has already said so
    const err = new Error("SVG preparation failed");
    err.dvReported = true;
    throw err;
  }

  const { width, height, bg, svg: finalSvg } = result;

  const isMobile = isMobileDevice();

  // data-diagview-scale on the exported element (or the diagram open in the
  // modal) overrides the global highResScale
  const overrideSource = sourceElement?.dataset ? sourceElement : state.activeSourceElement;
  const elementScale = parseInt(overrideSource?.dataset?.diagviewScale ?? "", 10);
  const highResScale =
    elementScale >= 1 && elementScale <= 10 ? elementScale : state.config.highResScale;

  let scale = isMobile
    ? state.config.mobileScale || EXPORT.MOBILE_SCALE_DEFAULT
    : highResScale || EXPORT.HIGH_RES_SCALE_DEFAULT;

  const targetPixels = width * scale * (height * scale);
  if (targetPixels > state.config.maxPixels) {
    scale = Math.sqrt(state.config.maxPixels / (width * height));
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
  img.width = Math.round(width);
  img.height = Math.round(height);

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
    ctx.fillStyle = bg || COLORS.BG_LIGHT;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (blobUrl) URL.revokeObjectURL(blobUrl);

  return { canvas, scale, width, height };
}

/**
 * Export as SVG
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename, transparent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToSVG(sourceElement, options = {}) {
  const svg = resolveSourceSvg(sourceElement);
  if (svg) await saveSVG(svg, options.filename || generateFilename(svg), options);
}

/**
 * The internal export paths resolve to true once the user has the file and
 * to undefined after a failure, so exportDiagram() knows to fire onExport.
 * @private
 */
async function saveSVG(originalSvg, filename, { transparent: isTransparent, modalClone }) {
  try {
    const prepared = await prepareSvgForExport(originalSvg, modalClone);
    // Over the size limit. cloneSVG has already shown "Diagram blocked".
    if (!prepared) return;
    const { bg, svg } = prepared;

    // Add bg rect for non-transparent SVG
    if (!isTransparent) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const vb = svg.getAttribute("viewBox");
      const vbParts = vb ? vb.split(/\s+|,/).map(parseFloat) : [0, 0];
      rect.setAttribute("x", vbParts[0] || 0);
      rect.setAttribute("y", vbParts[1] || 0);
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", "100%");
      rect.setAttribute("fill", bg);
      svg.insertBefore(rect, svg.firstChild);
    }

    downloadSVG(await serializeSVGAsync(svg), filename);
    showSuccessToast("SVG saved");
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
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename and modalClone. filename names the
 *   download used when the clipboard is unavailable.
 * @returns {Promise<boolean|undefined>} True once the markup is copied or downloaded
 */
export async function copySVGCode(sourceElement, options = {}) {
  const originalSvg = sourceElement.querySelector("svg");
  if (!originalSvg) return showErrorToast("No SVG found");

  try {
    const prepared = await prepareSvgForExport(originalSvg, options.modalClone);
    // Over the size limit. cloneSVG has already shown "Diagram blocked".
    if (!prepared) return;
    const data = await serializeSVGAsync(prepared.svg);

    let copied;
    if (navigator.clipboard && window.isSecureContext) {
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
      showSuccessToast("📋 SVG Code copied to clipboard!");
    } else {
      downloadSVG(data, options.filename || generateFilename(originalSvg));
      showSuccessToast("SVG downloaded (Clipboard unavailable)");
    }
    return true;
  } catch (e) {
    showErrorToast("Copy SVG Failed", e.message);
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
  try {
    const isWebP = format === "webp";
    const isJpeg = format === "jpeg" || format === "jpg";

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
      showInfoToast(`Processing ${label}...`);
    }

    // Small delay to ensure toast renders before heavy canvas work
    await new Promise((resolve) => setTimeout(resolve, TIMING.RENDER_DELAY));

    let canvasRef = null;
    try {
      const { canvas, scale } = await renderToCanvas(sourceElement, modalClone, transparent);
      canvasRef = canvas;

      const quality = isWebP ? 0.95 : undefined;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
          mime,
          quality,
        );
      });

      if (copy) {
        // Fallback when the clipboard cannot be used: hand the file over as a download
        const downloadInstead = () => {
          const url = URL.createObjectURL(blob);
          downloadFile(url, `${filename}.${ext}`);
          setTimeout(() => URL.revokeObjectURL(url), TIMING.CLEANUP_DELAY);
          showSuccessToast(`${label} downloaded (Clipboard unavailable)`);
        };

        // Clipboard (PNG only usually)
        if (!isClipboardAvailable() || isWebP) {
          downloadInstead();
        } else {
          try {
            await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
            showSuccessToast("Copied to clipboard!");
          } catch (err) {
            // Safari requires the write to happen inside the user gesture; by
            // the time the canvas has rendered that window has closed and it
            // rejects with NotAllowedError. Treat it like a missing clipboard.
            if (err?.name !== "NotAllowedError") throw err;
            downloadInstead();
          }
        }
      } else {
        // Download: Use BlobURL for maximum stability
        const downloadUrl = URL.createObjectURL(blob);
        downloadFile(downloadUrl, `${filename}.${ext}`);
        // Revoke after a short delay to ensure browser has started the download
        setTimeout(() => URL.revokeObjectURL(downloadUrl), TIMING.BUTTON_SUCCESS_DURATION);
        showSuccessToast(`${scale.toFixed(1)}x ${label} saved`);
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
    if (e?.dvReported) return;
    console.error("DiagView Export Error:", e);

    // Handle "Tainted Canvas" security error specifically
    if (e.name === "SecurityError" || e.message?.includes("tainted")) {
      showErrorToast(
        "Export blocked by cross-origin image",
        "An embedded image from another domain blocked canvas export. " +
          "Use SVG export instead, or ensure external images have CORS headers (Access-Control-Allow-Origin: *).",
      );
    } else {
      showErrorToast("Export Failed", e.message);
    }
  }
}

/**
 * Export as PNG
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToPNG(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg);
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
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToJPEG(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg);
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
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToWebP(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg);
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
 * Copy to Clipboard (PNG)
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename and modalClone. filename names the
 *   download used when the clipboard is unavailable.
 * @returns {Promise<void>} Resolves when the image is copied or downloaded
 */
export async function copyToClipboard(sourceElement, options = {}) {
  const sourceSvg = resolveSourceSvg(sourceElement);
  if (!sourceSvg) return;
  const filename = options.filename || generateFilename(sourceSvg);
  await processImageExport(sourceElement, filename, "png", false, true, options.modalClone);
}

/**
 * Export as PDF
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportOptions} [options={}] - Reads filename, transparent and modalClone.
 *   PDF has no transparency, so transparent only shows a warning.
 * @returns {Promise<void>} Resolves when the download has started
 */
export async function exportToPDF(sourceElement, options = {}) {
  const svg = resolveSourceSvg(sourceElement);
  if (svg) await savePDF(sourceElement, options.filename || generateFilename(svg), options);
}

/**
 * Resolves to true once the PDF is saved. The PNG fallback resolves to
 * undefined because no PDF was made.
 * @private
 */
async function savePDF(sourceElement, filename, { transparent, modalClone }) {
  try {
    showInfoToast("Generating PDF...");
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

    const { canvas, width, height } = await renderToCanvas(sourceElement, modalClone, false);
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF(width > height ? "l" : "p", "px", [width, height]);
    pdf.addImage(imgData, "PNG", 0, 0, width, height, undefined, "FAST");
    pdf.save(`${filename}.pdf`);
    showSuccessToast("PDF saved");
    return true;
  } catch (e) {
    if (!e?.dvReported) showErrorToast("PDF Failed", e.message);
  }
}

/**
 * Main Export Handler
 * @param {HTMLElement} sourceElement - Element containing SVG
 * @param {ExportMode} mode - Export format. An unknown mode exports PNG.
 * @param {ExportOptions|SVGSVGElement|null} [options={}] - Reads filename, transparent,
 *   silent and modalClone. silent applies to png, jpeg and webp. An SVG element here
 *   is the old third argument and works as modalClone.
 * @returns {Promise<void>} Resolves after the export and, when it succeeded, the onExport callback
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

  const svg = sourceElement.querySelector("svg");
  if (!svg) return showErrorToast("No diagram found");

  const filename = options.filename || generateFilename(svg);
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

  const opts = { transparent: isTransparent, modalClone };
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
      ok = await processImageExport(sourceElement, filename, "png", false, true, modalClone);
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
}
