/**
 * DiagView Export Functionality - REFINED
 * Uses robust sizing logic to fix low-res exports
 * @module features/export
 */

import { state } from "../core/config.js";
import { EXPORT } from "../core/constants.js";
import {
  downloadFile,
  sanitizeFilename,
  getTimestamp,
  getDiagramTitle,
  getDiagramSvg,
} from "../core/utils.js";
import { showSuccessToast, showErrorToast } from "../ui/toast.js";
import { showSaved } from "./export/notices.js";
import { prepareSvgForExport, serializeSVGAsync } from "./export/prepare.js";
import { startCopy, copyMarkup } from "./export/clipboard.js";
import { renderToCanvas, processImageExport } from "./export/raster.js";
import { savePDF } from "./export/pdf.js";

export { renderToCanvas };

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

/** Most characters of the title an export file name keeps */
const MAX_TITLE_IN_FILENAME = 50;

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

  // A long title, such as a whole sentence in an accTitle, keeps its first
  // 50 characters. Most disks allow 255 bytes in a file name, and a
  // character can take 4 of them.
  const cleanTitle = Array.from(sanitizeFilename(rawTitle, "diagram"))
    .slice(0, MAX_TITLE_IN_FILENAME)
    .join("");
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

    const copied = await copyMarkup(clip, data);
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
 * The public PNG, JPEG, WebP and Copy Image functions. Resolves to
 * undefined, as they promise only that the export has finished.
 * @private
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} options - Export options
 * @param {"png"|"jpeg"|"webp"} format - Image format
 * @param {boolean} [copy] - Copy to the clipboard, which ignores transparent
 */
async function exportImage(sourceElement, options, format, copy) {
  const svg = resolveSourceSvg(sourceElement);
  if (!svg) return;
  await processImageExport(
    sourceElement,
    options.filename || generateFilename(svg, sourceElement),
    format,
    !copy && !!options.transparent, // transparent
    !!copy, // copy
    options.modalClone,
    !!options.silent, // silent
  );
}

/**
 * Export as PNG
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export function exportToPNG(sourceElement, options = {}) {
  return exportImage(sourceElement, options, "png");
}

/**
 * Export as JPEG
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export function exportToJPEG(sourceElement, options = {}) {
  return exportImage(sourceElement, options, "jpeg");
}

/**
 * Export as WebP
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, transparent, silent and modalClone
 * @returns {Promise<void>} Resolves when the download has started
 */
export function exportToWebP(sourceElement, options = {}) {
  return exportImage(sourceElement, options, "webp");
}

/**
 * Copy to Clipboard (PNG). Safari and Firefox copy only during a click, so
 * call it from the click handler before any await of your own.
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {ExportOptions} [options={}] - Reads filename, silent and modalClone. filename names
 *   the download used when the clipboard is unavailable.
 * @returns {Promise<void>} Resolves when the image is copied or downloaded
 */
export function copyToClipboard(sourceElement, options = {}) {
  return exportImage(sourceElement, options, "png", true);
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

/** Page SVGs with an image or PDF export still drawing */
const drawing = new WeakSet();

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
 *   when the export failed or was blocked, or a PDF fell back to PNG. Resolves to false
 *   at once for a PNG, JPEG, WebP, PDF or Copy Image export while another of these runs
 *   for the same diagram.
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
  // Drawing an image takes a lot of memory, so while one export of this
  // diagram draws, another one that draws, such as a second click, does
  // nothing. SVG and Copy SVG draw nothing and always run.
  const draws = mode !== "svg" && mode !== "copy-svg";
  if (draws) {
    if (drawing.has(svg)) return false;
    drawing.add(svg);
  }
  try {
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
          false, // transparent
          true, // copy
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
          known && isTransparent, // transparent
          false, // copy
          modalClone,
          silent,
        );
        ok = !!format;
      }
    }
  } finally {
    if (draws) drawing.delete(svg);
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
