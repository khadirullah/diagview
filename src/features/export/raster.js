/**
 * Draw an export onto a canvas and save or copy it as an image
 * @module features/export/raster
 */

import { state } from "../../core/config.js";
import { EXPORT, COLORS, TIMING } from "../../core/constants.js";
import { detectTheme } from "../../core/theme.js";
import { downloadFile, isMobileDevice, getDiagramSvg } from "../../core/utils.js";
import { settingHolders, readSetting } from "../../core/svg-clone.js";
import { showErrorToast, showProgressToast, showWarningToast } from "../../ui/toast.js";
import { countLinkedImages, linksOtherSite, showSaved } from "./notices.js";
import { prepareSvgForExport, serializeSVGAsync } from "./prepare.js";
import { startCopy, finishCopy } from "./clipboard.js";

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
 * Internal Image Export Processor. Resolves to the extension of the file
 * made ("png", "jpeg" or "webp") once the image is saved, copied, or
 * downloaded because the clipboard was unavailable.
 * @param {HTMLElement|SVGSVGElement} sourceElement - Diagram element, or the diagram's <svg>
 * @param {object} options - What to make
 * @param {string} options.filename - File name without extension
 * @param {"png"|"jpeg"|"webp"} options.format - Image format
 * @param {boolean} [options.transparent] - Skip the background fill
 * @param {boolean} [options.copy] - Copy to the clipboard instead of saving
 * @param {SVGSVGElement|null} [options.modalClone] - Fullscreen clone to draw from
 * @param {boolean} [options.silent=false] - Skip the notices and warnings
 */
export async function processImageExport(
  sourceElement,
  { filename, format, transparent, copy, modalClone, silent = false },
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
