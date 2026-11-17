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
  loadScript,
  getDiagramTitle,
  getDiagramSvg,
} from "../core/utils.js";
import { settingHolders, readSetting } from "../core/svg-clone.js";
import {
  showSuccessToast,
  showErrorToast,
  showProgressToast,
  showWarningToast,
} from "../ui/toast.js";
import { countLinkedImages, linksOtherSite, showSaved } from "./export/notices.js";
import { prepareSvgForExport, serializeSVGAsync } from "./export/prepare.js";
import { startCopy, finishCopy, copyMarkup } from "./export/clipboard.js";

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
 * data-diagview-scale for an export, which overrides the global highResScale.
 * The element passed in comes first, or the diagram open in the viewer when
 * that is not an element. Then the diagrams around the SVG, outer match
 * first, so the attribute also counts on the container of an exported <svg>
 * and on either element of a nested match.
 * @private
 * @param {HTMLElement|SVGSVGElement} sourceElement - Element passed to the export
 * @param {SVGSVGElement} svg - The diagram's SVG
 * @returns {string|undefined} The attribute value, or undefined when none is set
 */
function scaleAttribute(sourceElement, svg) {
  const passed = sourceElement?.dataset ? sourceElement : state.activeSourceElement;
  return readSetting([passed, ...settingHolders(svg)], "diagviewScale");
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

  let blobUrl = null;
  try {
    // A browser that is out of canvas memory gives no 2D context
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "The browser has no canvas to draw on. The diagram may be too large, so try SVG export.",
      );
    }

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

    try {
      await load("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr));
    } catch (_e) {
      blobUrl = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
      try {
        await load(blobUrl);
      } catch (_e2) {
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
  } catch (err) {
    // Free the canvas memory now, as the caller never gets the canvas
    canvas.width = 0;
    canvas.height = 0;
    throw err;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }

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

/**
 * Resolves to true once the PDF is saved. The PNG fallback resolves to
 * undefined because no PDF was made.
 * @private
 */
async function savePDF(sourceElement, filename, { transparent, modalClone, silent }) {
  try {
    showProgressToast("Generating PDF...");
    const pdfUrl = state.config.pdfLibraryUrl;
    // An element with id="jspdf" also shows up as window.jspdf, so look
    // for the jsPDF class itself
    if (typeof window.jspdf?.jsPDF !== "function") {
      await loadScript(pdfUrl, state.config.pdfLibraryIntegrity, "jspdf").catch(() => {
        // Silently handle load failure, the check below will trigger the fallback UI
      });
    }

    // Fallback: If no jsPDF, save as PNG
    if (typeof window.jspdf?.jsPDF !== "function") {
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
      false, // transparent
      true, // opaque
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
